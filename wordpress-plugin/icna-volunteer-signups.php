<?php
/**
 * Plugin Name: ICNA Volunteer Signups
 * Description: Embeds volunteer signup events from the ICNA Relief portal via shortcode. Fetches server-to-server (no iframe, no CORS) and proxies signups back through WordPress.
 * Version: 1.2.0
 * Author: ICNA Relief
 */

if (!defined('ABSPATH')) exit; // no direct access

// ============================================================
// Settings — Settings > ICNA Volunteer
// ============================================================

add_action('admin_menu', function () {
    add_options_page(
        'ICNA Volunteer Signups',
        'ICNA Volunteer',
        'manage_options',
        'icna-volunteer-signups',
        'icna_volunteer_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('icna_volunteer_settings', 'icna_volunteer_portal_url');
});

function icna_volunteer_settings_page() {
    ?>
    <div class="wrap">
        <h1>ICNA Volunteer Signups</h1>
        <form method="post" action="options.php">
            <?php settings_fields('icna_volunteer_settings'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="icna_volunteer_portal_url">Portal Base URL</label></th>
                    <td>
                        <input type="url" id="icna_volunteer_portal_url" name="icna_volunteer_portal_url"
                               value="<?php echo esc_attr(get_option('icna_volunteer_portal_url', '')); ?>"
                               placeholder="https://portal.yourdomain.org" class="regular-text" required />
                        <p class="description">No trailing slash. The plugin calls <code>{this}/api/volunteer/events</code> and <code>{this}/api/volunteer/signup</code>.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Usage</h2>
        <p>Show every published event for one office:</p>
        <code>[icna_volunteer office="Dallas Office"]</code>
        <p style="margin-top:1em;">Show a single event by its slug (from the event's "Public link" in the portal):</p>
        <code>[icna_volunteer slug="dallas-food-pantry-aug-2026-x7q2"]</code>
        <p style="margin-top:1em;"><strong>If the office name keeps showing "no events" for no obvious reason:</strong> some WordPress editors (Text/Visual modules, some page builders) auto-convert straight quotes into curly "smart quotes," which breaks the office name match since it contains a space. Use the office's UUID instead — it has no spaces, so it isn't affected — or better, add this shortcode inside a raw Code/HTML block, which usually skips that auto-conversion entirely:</p>
        <code>[icna_volunteer office_id="11ff816d-bb32-4d1e-8f6d-9fd6cb4b6d03"]</code>
        <p class="description">Find an office's UUID by visiting <code>{portal-url}/api/volunteer/events</code> in a browser and reading the <code>office_id</code> field, or ask whoever manages the portal for it.</p>
    </div>
    <?php
}

function icna_volunteer_portal_url() {
    return rtrim(get_option('icna_volunteer_portal_url', ''), '/');
}

// ============================================================
// Shortcode: [icna_volunteer office="..."] or [icna_volunteer slug="..."]
// ============================================================

// Strips stray straight AND curly/smart quote characters that WordPress's
// wptexturize() (run by some editors, e.g. the classic Text module) can
// leave stuck to an attribute value when it mangles the shortcode before
// parsing. Doesn't fix truncation from a space inside a texturized value —
// that's why office_id (no spaces) exists as the bulletproof option below —
// but cleans up simple leading/trailing quote debris either way.
function icna_volunteer_clean_attr($value) {
    return trim($value, "\"'\xE2\x80\x9C\xE2\x80\x9D\xE2\x80\x98\xE2\x80\x99 ");
}

add_shortcode('icna_volunteer', function ($atts) {
    $atts = shortcode_atts([
        'office'    => '',
        'office_id' => '', // UUID from b2s_offices — has no spaces, so it
                            // survives even a texturize-mangled shortcode.
                            // Use this if the office name keeps breaking.
        'slug'      => '',
    ], $atts);

    $atts['office']    = icna_volunteer_clean_attr($atts['office']);
    $atts['office_id'] = icna_volunteer_clean_attr($atts['office_id']);
    $atts['slug']      = icna_volunteer_clean_attr($atts['slug']);

    // office_id takes priority when both are somehow present.
    if ($atts['office_id']) {
        $atts['office'] = $atts['office_id'];
    }

    $base = icna_volunteer_portal_url();
    if (!$base) {
        return '<p><em>ICNA Volunteer Signups: set the Portal Base URL under Settings &rarr; ICNA Volunteer.</em></p>';
    }

    // Cache the events list for 5 minutes so a busy page doesn't hammer
    // the portal API on every single pageview. Signup submissions are
    // never cached — those always go live.
    $cache_key = 'icna_vol_' . md5($atts['office'] . '|' . $atts['slug']);
    $events = get_transient($cache_key);

    if ($events === false) {
        $query_args = [];
        if ($atts['office']) $query_args['office'] = $atts['office'];
        if ($atts['slug'])   $query_args['slug']   = $atts['slug'];

        $url = add_query_arg($query_args, $base . '/api/volunteer/events');

        $response = wp_remote_get($url, ['timeout' => 8]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return '<p><em>Volunteer signups are temporarily unavailable. Please check back shortly.</em></p>';
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $events = $body['events'] ?? [];

        set_transient($cache_key, $events, 5 * MINUTE_IN_SECONDS);
    }

    if (empty($events)) {
        return '<p><em>No volunteer events open right now — check back soon.</em></p>';
    }

    icna_volunteer_enqueue_assets();

    ob_start();
    ?>
    <div class="icna-volunteer-widget">
        <?php foreach ($events as $event): ?>
            <div class="icna-vol-event">
                <div class="icna-vol-event-head">
                    <h3 class="icna-vol-event-title"><?php echo esc_html($event['title']); ?></h3>
                    <?php if (!empty($event['starts_on']) || !empty($event['location_name']) || !empty($event['location_address'])): ?>
                        <p class="icna-vol-event-meta">
                            <?php if (!empty($event['starts_on'])): ?>
                                <span class="icna-vol-meta-item">
                                    <?php
                                    echo esc_html($event['starts_on']);
                                    if (!empty($event['ends_on']) && $event['ends_on'] !== $event['starts_on']) {
                                        echo esc_html(' – ' . $event['ends_on']);
                                    }
                                    ?>
                                </span>
                            <?php endif; ?>
                            <?php if (!empty($event['location_name']) || !empty($event['location_address'])): ?>
                                <span class="icna-vol-meta-item"><?php echo esc_html(trim(($event['location_name'] ?? '') . ' ' . ($event['location_address'] ?? ''))); ?></span>
                            <?php endif; ?>
                        </p>
                    <?php endif; ?>
                </div>

                <?php if (!empty($event['description'])): ?>
                    <p class="icna-vol-event-desc"><?php echo esc_html($event['description']); ?></p>
                <?php endif; ?>

                <div class="icna-vol-slots">
                    <?php if (empty($event['slots'])): ?>
                        <p class="icna-vol-empty">No slots open yet.</p>
                    <?php endif; ?>
                    <?php foreach ($event['slots'] as $slot): ?>
                        <?php
                        $full = ($slot['spots_remaining'] ?? 0) <= 0;
                        $capacity = max(1, (int) $slot['capacity']);
                        $claimed = max(0, $capacity - (int) $slot['spots_remaining']);
                        $show_dots = $capacity <= 12;
                        ?>
                        <div class="icna-vol-slot <?php echo $full ? 'is-full' : ''; ?>" data-slot-id="<?php echo esc_attr($slot['id']); ?>" data-slot-type="<?php echo esc_attr($slot['slot_type']); ?>" data-max-qty="<?php echo esc_attr($slot['spots_remaining']); ?>">
                            <?php if ($full): ?><span class="icna-vol-ribbon">Full</span><?php endif; ?>
                            <div class="icna-vol-slot-row">
                                <div class="icna-vol-slot-info">
                                    <div class="icna-vol-slot-label"><?php echo esc_html($slot['label']); ?></div>
                                    <div class="icna-vol-slot-meta">
                                        <?php if ($show_dots): ?>
                                            <span class="icna-vol-dots">
                                                <?php for ($i = 0; $i < $capacity; $i++): ?>
                                                    <span class="icna-vol-dot <?php echo $i < $claimed ? 'is-taken' : ''; ?>"></span>
                                                <?php endfor; ?>
                                            </span>
                                        <?php endif; ?>
                                        <span><?php echo $full ? 'Full' : esc_html($slot['spots_remaining'] . ' of ' . $slot['capacity'] . ' open'); ?></span>
                                    </div>
                                </div>
                                <?php if (!$full): ?>
                                    <button type="button" class="icna-vol-toggle">Sign Up</button>
                                <?php endif; ?>
                            </div>

                            <?php if (!$full): ?>
                                <form class="icna-vol-form" style="display:none;">
                                    <input type="text" name="name" placeholder="Full name" required />
                                    <input type="email" name="email" placeholder="Email" required />
                                    <input type="text" name="phone" placeholder="Phone (optional)" />
                                    <?php if ($slot['slot_type'] === 'item' && $slot['capacity'] > 1): ?>
                                        <input type="number" name="qty" min="1" max="<?php echo esc_attr($slot['spots_remaining']); ?>" value="1" placeholder="Quantity" />
                                    <?php endif; ?>
                                    <textarea name="notes" rows="2" placeholder="Notes (optional)"></textarea>
                                    <button type="submit" class="icna-vol-submit">Confirm Signup</button>
                                    <p class="icna-vol-form-msg" style="display:none;"></p>
                                </form>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
    return ob_get_clean();
});

// ============================================================
// Assets (inline — keeps this a single-file plugin)
// ============================================================

function icna_volunteer_enqueue_assets() {
    static $done = false;
    if ($done) return;
    $done = true;

    wp_register_style('icna-volunteer-inline', false);
    wp_enqueue_style('icna-volunteer-inline');
    wp_add_inline_style('icna-volunteer-inline', '
        .icna-volunteer-widget {
            --icna-green: #2F6D46;
            --icna-green-dark: #1F4A30;
            --icna-green-tint: #EFF6F1;
            --icna-amber: #E2892F;
            --icna-amber-dark: #C06F1F;
            --icna-ink: #2A2A24;
            --icna-ink-dim: #6B6A5E;
            --icna-line: #E4E0D4;
            max-width: 680px;
            padding: 20px;
            border-radius: 16px;
            background-color: #FAF8F2;
            background-image: radial-gradient(circle, #E4E0D2 1px, transparent 1px);
            background-size: 16px 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .icna-vol-event {
            position: relative;
            background: #fff;
            border: 1px solid var(--icna-line);
            border-left: 5px solid var(--icna-green);
            border-radius: 14px;
            padding: 22px 22px 18px;
            margin-bottom: 18px;
            box-shadow: 0 2px 10px rgba(31, 74, 48, 0.06);
        }
        .icna-vol-event:last-child { margin-bottom: 0; }
        .icna-vol-event-head { margin-bottom: 6px; }
        .icna-vol-event-title {
            font-family: Georgia, "Times New Roman", serif;
            font-weight: 700;
            font-size: 21px;
            line-height: 1.25;
            color: var(--icna-green-dark);
            margin: 0 0 6px;
        }
        .icna-vol-event-meta {
            margin: 0;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--icna-amber-dark);
        }
        .icna-vol-meta-item { margin-right: 14px; }
        .icna-vol-meta-item:not(:last-child)::after {
            content: "•";
            margin-left: 14px;
            color: var(--icna-line);
        }
        .icna-vol-event-desc {
            font-size: 14px;
            line-height: 1.5;
            color: var(--icna-ink);
            margin: 12px 0 0;
        }
        .icna-vol-slots { margin-top: 16px; }
        .icna-vol-slot {
            position: relative;
            overflow: hidden;
            background: var(--icna-green-tint);
            border: 1px dashed #C9DBCE;
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 10px;
        }
        .icna-vol-slot:last-child { margin-bottom: 0; }
        .icna-vol-slot.is-full {
            background: #F4F3EE;
            border-style: solid;
            border-color: var(--icna-line);
        }
        .icna-vol-ribbon {
            position: absolute;
            top: 10px;
            right: -30px;
            transform: rotate(40deg);
            background: var(--icna-ink-dim);
            color: #fff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 3px 34px;
        }
        .icna-vol-slot-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .icna-vol-slot-info { min-width: 0; }
        .icna-vol-slot-label { font-weight: 700; font-size: 14px; color: var(--icna-ink); }
        .icna-vol-slot-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--icna-ink-dim); margin-top: 4px; flex-wrap: wrap; }
        .icna-vol-dots { display: inline-flex; gap: 3px; }
        .icna-vol-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; border: 1.5px solid var(--icna-green); box-sizing: border-box; }
        .icna-vol-dot.is-taken { background: var(--icna-amber); border-color: var(--icna-amber); }
        .icna-vol-toggle, .icna-vol-submit {
            flex-shrink: 0;
            background: var(--icna-amber);
            color: #fff;
            border: none;
            border-radius: 999px;
            padding: 8px 18px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }
        .icna-vol-toggle:hover, .icna-vol-submit:hover { background: var(--icna-amber-dark); }
        .icna-vol-submit { width: 100%; margin-top: 2px; }
        .icna-vol-form { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .icna-vol-form input, .icna-vol-form textarea {
            padding: 9px 12px;
            border: 1px solid #D8D4C4;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            background: #fff;
        }
        .icna-vol-form input:focus, .icna-vol-form textarea:focus {
            outline: none;
            border-color: var(--icna-green);
            box-shadow: 0 0 0 3px rgba(47, 109, 70, 0.15);
        }
        .icna-vol-form-msg.error { color: #B3261E; font-size: 13px; margin: 0; }
        .icna-vol-form-success {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: var(--icna-green-dark);
            font-weight: 600;
        }
        .icna-vol-form-success .icna-vol-check {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--icna-green);
            color: #fff;
            font-size: 12px;
            flex-shrink: 0;
        }
        .icna-vol-empty { font-size: 13px; color: var(--icna-ink-dim); margin: 0; }
        @media (max-width: 480px) {
            .icna-vol-slot-row { flex-wrap: wrap; }
            .icna-vol-toggle { width: 100%; }
        }
    ');

    wp_register_script('icna-volunteer-inline', false, [], '1.0.0', true);
    wp_enqueue_script('icna-volunteer-inline');

    $ajax_url = admin_url('admin-ajax.php');
    $nonce = wp_create_nonce('icna_volunteer_signup');

    wp_add_inline_script('icna-volunteer-inline', "
        (function() {
            document.addEventListener('click', function (e) {
                var toggle = e.target.closest('.icna-vol-toggle');
                if (!toggle) return;
                var slot = toggle.closest('.icna-vol-slot');
                var form = slot.querySelector('.icna-vol-form');
                if (!form) return;
                var visible = form.style.display !== 'none';
                form.style.display = visible ? 'none' : 'flex';
                toggle.textContent = visible ? 'Sign Up' : 'Cancel';
            });

            document.addEventListener('submit', function (e) {
                var form = e.target.closest('.icna-vol-form');
                if (!form) return;
                e.preventDefault();

                var slotEl = form.closest('.icna-vol-slot');
                var slotId = slotEl.getAttribute('data-slot-id');
                var msg = form.querySelector('.icna-vol-form-msg');
                var submitBtn = form.querySelector('.icna-vol-submit');

                var payload = new FormData();
                payload.append('action', 'icna_volunteer_signup');
                payload.append('nonce', '" . esc_js($nonce) . "');
                payload.append('slot_id', slotId);
                payload.append('name', form.name.value);
                payload.append('email', form.email.value);
                if (form.phone) payload.append('phone', form.phone.value);
                if (form.qty) payload.append('qty', form.qty.value);
                if (form.notes) payload.append('notes', form.notes.value);

                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing up...';
                msg.style.display = 'none';

                fetch('" . esc_js($ajax_url) . "', { method: 'POST', body: payload, credentials: 'same-origin' })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Confirm Signup';
                        if (data.success) {
                            form.innerHTML = '<p class=\"icna-vol-form-success\"><span class=\"icna-vol-check\">&#10003;</span> You\\'re signed up! Check your email for details.</p>';
                        } else {
                            msg.textContent = (data.data && data.data.error) ? data.data.error : 'Something went wrong. Please try again.';
                            msg.className = 'icna-vol-form-msg error';
                            msg.style.display = 'block';
                        }
                    })
                    .catch(function () {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Confirm Signup';
                        msg.textContent = 'Network error. Please try again.';
                        msg.className = 'icna-vol-form-msg error';
                        msg.style.display = 'block';
                    });
            });
        })();
    ");
}

// ============================================================
// AJAX proxy — WordPress server posts to the portal server.
// Browser never talks to the portal directly, no CORS needed.
// ============================================================

add_action('wp_ajax_icna_volunteer_signup', 'icna_volunteer_handle_signup');
add_action('wp_ajax_nopriv_icna_volunteer_signup', 'icna_volunteer_handle_signup');

function icna_volunteer_handle_signup() {
    check_ajax_referer('icna_volunteer_signup', 'nonce');

    $base = icna_volunteer_portal_url();
    if (!$base) {
        wp_send_json_error(['error' => 'Volunteer signups are not configured yet.'], 500);
    }

    $slot_id = sanitize_text_field($_POST['slot_id'] ?? '');
    $name    = sanitize_text_field($_POST['name'] ?? '');
    $email   = sanitize_email($_POST['email'] ?? '');
    $phone   = sanitize_text_field($_POST['phone'] ?? '');
    $qty     = isset($_POST['qty']) ? intval($_POST['qty']) : 1;
    $notes   = sanitize_textarea_field($_POST['notes'] ?? '');

    if (!$slot_id || !$name || !$email) {
        wp_send_json_error(['error' => 'Please fill in your name and email.'], 400);
    }

    $response = wp_remote_post($base . '/api/volunteer/signup', [
        'timeout' => 8,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'slot_id' => $slot_id,
            'name'    => $name,
            'email'   => $email,
            'phone'   => $phone ?: null,
            'qty'     => $qty ?: 1,
            'notes'   => $notes ?: null,
            'source'  => 'wordpress',
        ]),
    ]);

    if (is_wp_error($response)) {
        wp_send_json_error(['error' => 'Could not reach the volunteer portal. Please try again.'], 502);
    }

    $code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);

    if ($code !== 200) {
        wp_send_json_error(['error' => $body['error'] ?? 'Something went wrong.'], $code);
    }

    icna_volunteer_clear_cache();

    wp_send_json_success(['ok' => true]);
}

// Wipes every cached events listing (all offices/slugs at once — we don't
// know from here which shortcode/page a signup came through, so clear
// them all rather than risk showing a stale count anywhere on the site).
// Runs right after a signup succeeds so the very next pageview — including
// the person's own refresh — shows accurate spots_remaining immediately,
// instead of waiting out the 5-minute cache window.
function icna_volunteer_clear_cache() {
    global $wpdb;
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '\_transient\_icna\_vol\_%'
            OR option_name LIKE '\_transient\_timeout\_icna\_vol\_%'"
    );
}

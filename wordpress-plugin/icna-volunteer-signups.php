<?php
/**
 * Plugin Name: ICNA Volunteer Signups
 * Description: Embeds volunteer signup events from the ICNA Relief portal via shortcode. Fetches server-to-server (no iframe, no CORS) and proxies signups back through WordPress.
 * Version: 1.0.0
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
    </div>
    <?php
}

function icna_volunteer_portal_url() {
    return rtrim(get_option('icna_volunteer_portal_url', ''), '/');
}

// ============================================================
// Shortcode: [icna_volunteer office="..."] or [icna_volunteer slug="..."]
// ============================================================

add_shortcode('icna_volunteer', function ($atts) {
    $atts = shortcode_atts([
        'office' => '',
        'slug'   => '',
    ], $atts);

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
                <h3 class="icna-vol-event-title"><?php echo esc_html($event['title']); ?></h3>
                <?php if (!empty($event['starts_on'])): ?>
                    <p class="icna-vol-event-date">
                        <?php
                        echo esc_html($event['starts_on']);
                        if (!empty($event['ends_on']) && $event['ends_on'] !== $event['starts_on']) {
                            echo esc_html(' – ' . $event['ends_on']);
                        }
                        ?>
                    </p>
                <?php endif; ?>
                <?php if (!empty($event['description'])): ?>
                    <p class="icna-vol-event-desc"><?php echo esc_html($event['description']); ?></p>
                <?php endif; ?>
                <?php if (!empty($event['location_name']) || !empty($event['location_address'])): ?>
                    <p class="icna-vol-event-location">
                        <?php echo esc_html(trim(($event['location_name'] ?? '') . ' ' . ($event['location_address'] ?? ''))); ?>
                    </p>
                <?php endif; ?>

                <div class="icna-vol-slots">
                    <?php if (empty($event['slots'])): ?>
                        <p class="icna-vol-empty">No slots open yet.</p>
                    <?php endif; ?>
                    <?php foreach ($event['slots'] as $slot): ?>
                        <?php $full = ($slot['spots_remaining'] ?? 0) <= 0; ?>
                        <div class="icna-vol-slot <?php echo $full ? 'is-full' : ''; ?>" data-slot-id="<?php echo esc_attr($slot['id']); ?>" data-slot-type="<?php echo esc_attr($slot['slot_type']); ?>" data-max-qty="<?php echo esc_attr($slot['spots_remaining']); ?>">
                            <div class="icna-vol-slot-row">
                                <div>
                                    <div class="icna-vol-slot-label"><?php echo esc_html($slot['label']); ?></div>
                                    <div class="icna-vol-slot-meta">
                                        <?php echo $full ? 'Full' : esc_html($slot['spots_remaining'] . ' of ' . $slot['capacity'] . ' open'); ?>
                                    </div>
                                </div>
                                <?php if (!$full): ?>
                                    <button type="button" class="icna-vol-toggle button">Sign Up</button>
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
                                    <button type="submit" class="button button-primary icna-vol-submit">Confirm Signup</button>
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
        .icna-volunteer-widget { max-width: 640px; }
        .icna-vol-event { border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
        .icna-vol-event-title { margin: 0 0 4px; }
        .icna-vol-event-date, .icna-vol-event-location { color: #666; font-size: 13px; margin: 0 0 4px; }
        .icna-vol-event-desc { font-size: 14px; margin: 8px 0; }
        .icna-vol-slots { margin-top: 12px; }
        .icna-vol-slot { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
        .icna-vol-slot.is-full { opacity: 0.6; }
        .icna-vol-slot-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .icna-vol-slot-label { font-weight: 600; font-size: 14px; }
        .icna-vol-slot-meta { font-size: 12px; color: #666; }
        .icna-vol-form { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .icna-vol-form input, .icna-vol-form textarea { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
        .icna-vol-form-msg.error { color: #b91c1c; font-size: 13px; }
        .icna-vol-form-msg.success { color: #15803d; font-size: 13px; }
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
                            form.innerHTML = '<p style=\"color:#15803d;font-size:14px;\">You\\'re signed up! Check your email for details.</p>';
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

    wp_send_json_success(['ok' => true]);
}

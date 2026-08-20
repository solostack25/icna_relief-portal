<?php
/**
 * Plugin Name: ICNA Fundraisers
 * Description: Embeds CharityStack fundraisers/events created in the ICNA Relief portal via shortcode. Fetches server-to-server (no CORS) and renders the CharityStack embed CharityStack itself returned when the fundraiser was created.
 * Version: 1.0.0
 * Author: ICNA Relief
 */

if (!defined('ABSPATH')) exit; // no direct access

// ============================================================
// Settings — Settings > ICNA Fundraisers
// ============================================================

add_action('admin_menu', function () {
    add_options_page(
        'ICNA Fundraisers',
        'ICNA Fundraisers',
        'manage_options',
        'icna-fundraisers',
        'icna_fundraisers_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('icna_fundraisers_settings', 'icna_fundraisers_portal_url');
});

function icna_fundraisers_settings_page() {
    ?>
    <div class="wrap">
        <h1>ICNA Fundraisers</h1>
        <form method="post" action="options.php">
            <?php settings_fields('icna_fundraisers_settings'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="icna_fundraisers_portal_url">Portal Base URL</label></th>
                    <td>
                        <input type="url" id="icna_fundraisers_portal_url" name="icna_fundraisers_portal_url"
                               value="<?php echo esc_attr(get_option('icna_fundraisers_portal_url', '')); ?>"
                               placeholder="https://portal.yourdomain.org" class="regular-text" required />
                        <p class="description">No trailing slash. The plugin calls <code>{this}/api/fundraisers</code>.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Usage</h2>
        <p>Show every published fundraiser for one office:</p>
        <code>[icna_fundraiser office="Houston Office"]</code>
        <p style="margin-top:1em;">Show a single fundraiser by its slug (from the fundraiser's manage page in the portal):</p>
        <code>[icna_fundraiser slug="houston-ramadan-food-drive-x7q2"]</code>
        <p style="margin-top:1em;"><strong>If the office name keeps showing "no fundraisers" for no obvious reason:</strong> some editors auto-convert straight quotes into curly "smart quotes," which breaks the office name match since it contains a space. Use the office's UUID instead, or add the shortcode inside a raw Code/HTML block:</p>
        <code>[icna_fundraiser office_id="11ff816d-bb32-4d1e-8f6d-9fd6cb4b6d03"]</code>
        <p class="description">Find an office's UUID by visiting <code>{portal-url}/api/fundraisers</code> in a browser and reading the <code>office_id</code> field.</p>
    </div>
    <?php
}

function icna_fundraisers_portal_url() {
    return rtrim(get_option('icna_fundraisers_portal_url', ''), '/');
}

// ============================================================
// Shortcode: [icna_fundraiser office="..."] or [icna_fundraiser slug="..."]
// ============================================================

function icna_fundraisers_clean_attr($value) {
    return trim($value, "\"'\xE2\x80\x9C\xE2\x80\x9D\xE2\x80\x98\xE2\x80\x99 ");
}

// The embed CharityStack returns is trusted (it came straight from their
// API response, stored in the portal, never user-editable HTML pasted by
// a person) — but we still restrict what tags/attributes can render here
// as defense-in-depth, in case that ever changes. Only iframe/script tags
// pointing at a charitystack.com host are allowed through.
function icna_fundraisers_sanitize_embed($html) {
    if (!preg_match('/^\s*<(iframe|script)[^>]*\bsrc=["\']https:\/\/([a-z0-9-]+\.)?charitystack\.com/i', $html)) {
        return '';
    }
    return wp_kses($html, [
        'iframe' => ['src' => true, 'width' => true, 'height' => true, 'frameborder' => true, 'style' => true, 'title' => true, 'allow' => true, 'loading' => true],
        'script' => ['src' => true, 'async' => true, 'defer' => true],
        'div'    => ['id' => true, 'class' => true, 'style' => true, 'data-form-id' => true],
    ]);
}

add_shortcode('icna_fundraiser', function ($atts) {
    $atts = shortcode_atts([
        'office'    => '',
        'office_id' => '',
        'slug'      => '',
    ], $atts);

    $atts['office']    = icna_fundraisers_clean_attr($atts['office']);
    $atts['office_id'] = icna_fundraisers_clean_attr($atts['office_id']);
    $atts['slug']      = icna_fundraisers_clean_attr($atts['slug']);

    if ($atts['office_id']) {
        $atts['office'] = $atts['office_id'];
    }

    $base = icna_fundraisers_portal_url();
    if (!$base) {
        return '<p><em>ICNA Fundraisers: set the Portal Base URL under Settings &rarr; ICNA Fundraisers.</em></p>';
    }

    // Cache for 5 minutes — the embed itself and the raised-amount total
    // shown next to it don't need to be second-by-second live.
    $cache_key = 'icna_fnd_' . md5($atts['office'] . '|' . $atts['slug']);
    $fundraisers = get_transient($cache_key);

    if ($fundraisers === false) {
        $query_args = [];
        if ($atts['office']) $query_args['office'] = $atts['office'];
        if ($atts['slug'])   $query_args['slug']   = $atts['slug'];

        $url = add_query_arg($query_args, $base . '/api/fundraisers');
        $response = wp_remote_get($url, ['timeout' => 8]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return '<p><em>Fundraisers are temporarily unavailable. Please check back shortly.</em></p>';
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $fundraisers = $body['fundraisers'] ?? [];

        set_transient($cache_key, $fundraisers, 5 * MINUTE_IN_SECONDS);
    }

    if (empty($fundraisers)) {
        return '<p><em>No fundraisers open right now — check back soon.</em></p>';
    }

    icna_fundraisers_enqueue_assets();

    ob_start();
    ?>
    <div class="icna-fnd-widget">
        <?php foreach ($fundraisers as $f): ?>
            <?php
            $embed = icna_fundraisers_sanitize_embed($f['charitystack_embed_html'] ?? '');
            $goal = isset($f['goal']) ? (float) $f['goal'] : 0;
            $raised = isset($f['raised_amount']) ? (float) $f['raised_amount'] : 0;
            $pct = $goal > 0 ? min(100, round(($raised / $goal) * 100)) : 0;
            ?>
            <div class="icna-fnd-card" style="<?php echo $f['color'] ? '--icna-fnd-color: ' . esc_attr($f['color']) . ';' : ''; ?>">
                <?php if (!empty($f['header_image'])): ?>
                    <img class="icna-fnd-header-img" src="<?php echo esc_url($f['header_image']); ?>" alt="" />
                <?php endif; ?>
                <h3 class="icna-fnd-title"><?php echo esc_html($f['title']); ?></h3>
                <?php if (!empty($f['description'])): ?>
                    <p class="icna-fnd-desc"><?php echo esc_html($f['description']); ?></p>
                <?php endif; ?>

                <?php if (!empty($f['location']) || !empty($f['event_date'])): ?>
                    <p class="icna-fnd-meta">
                        <?php echo esc_html(trim(($f['event_date'] ?? '') . ' ' . ($f['start_time'] ?? '') . ' ' . ($f['location'] ?? ''))); ?>
                    </p>
                <?php endif; ?>

                <?php if ($goal > 0): ?>
                    <div class="icna-fnd-progress">
                        <div class="icna-fnd-progress-bar" style="width: <?php echo esc_attr($pct); ?>%;"></div>
                    </div>
                    <p class="icna-fnd-progress-label">
                        $<?php echo esc_html(number_format($raised)); ?> raised of $<?php echo esc_html(number_format($goal)); ?> goal
                    </p>
                <?php endif; ?>

                <div class="icna-fnd-embed">
                    <?php if ($embed) { echo $embed; } else { echo '<p class="icna-fnd-empty">Donation form unavailable.</p>'; } ?>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
    return ob_get_clean();
});

function icna_fundraisers_enqueue_assets() {
    wp_register_style('icna-fnd-inline', false);
    wp_enqueue_style('icna-fnd-inline');
    wp_add_inline_style('icna-fnd-inline', '
        .icna-fnd-widget { display: flex; flex-direction: column; gap: 24px; }
        .icna-fnd-card {
            --icna-fnd-color: #10B981;
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 12px;
            padding: 20px;
            background: #fff;
        }
        .icna-fnd-header-img { width: 100%; border-radius: 8px; margin-bottom: 12px; object-fit: cover; max-height: 220px; }
        .icna-fnd-title { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
        .icna-fnd-desc { margin: 0 0 8px; font-size: 14px; color: rgba(0,0,0,0.65); }
        .icna-fnd-meta { margin: 0 0 12px; font-size: 13px; color: rgba(0,0,0,0.55); }
        .icna-fnd-progress { height: 8px; border-radius: 4px; background: rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 6px; }
        .icna-fnd-progress-bar { height: 100%; background: var(--icna-fnd-color); }
        .icna-fnd-progress-label { margin: 0 0 16px; font-size: 12px; font-weight: 600; color: rgba(0,0,0,0.6); }
        .icna-fnd-embed { margin-top: 12px; }
        .icna-fnd-empty { font-size: 13px; color: rgba(0,0,0,0.5); }
    ');
}

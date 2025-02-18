<?php
/*
Plugin Name: crouton
Plugin URI: https://wordpress.org/plugins/crouton/
Description: A tabbed based display for showing meeting information.
Author: bmlt-enabled
Author URI: https://bmlt.app
Version: 3.16.3
*/
/* Disallow direct access to the plugin file */
if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {
    // die('Sorry, but you cannot access this page directly.');
}
ini_set('max_execution_time', 120);
if (!class_exists("Crouton")) {
    // phpcs:disable PSR1.Classes.ClassDeclaration.MissingNamespace
    class Crouton
    // phpcs:enable PSR1.Classes.ClassDeclaration.MissingNamespace
    {
        public $optionsName = 'bmlt_tabs_options';
        public $options = array();
        public $croutonBlockInitialized = false;
        public static $HOUR_IN_SECONDS = 3600;
        public $has_handlebars = false;
        public $themes = [
            "asheboro",
            "florida-nights",
            "frog",
            "gold-coast",
            "jack",
            "kevin",
            "lucy",
            "none",
            "one-nine",
            "orange-monster",
            "patrick",
            "quebec",
            "seattle-rain",
            "sezf",
            "truth"
        ];
        const HTTP_RETRIEVE_ARGS = array(
            'headers' => array(
                'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:105.0) Gecko/20100101 Firefox/105.0 +crouton'
            ),
            'timeout' => 60
        );
        public $shortCodeOptions = array(
            "root_server" => '',
            "service_body" => '',
            "service_body_parent" => '',
            "venue_types" => '',
            "formats" => '',
            "has_tabs" => '1',
            "has_days" => '0',
            "has_groups" => '1',
            "has_areas" => '0',
            "has_regions" => '0',
            "has_cities" => '1',
            "has_formats" => '1',
            "has_locations" => '1',
            "has_sub_province" => '0',
            "has_neighborhoods" => '0',
            "has_states" => '0',
            "has_languages" => '0',
            "has_common_needs" => '0',
            "has_venues" => '1',
            "include_city_button" => '1',
            "include_weekday_button" => '1',
            "include_unpublished" => '0',
            "button_filters_option" => "City:location_municipality",
            "button_format_filters_option" => "",
            "view_by" => 'weekday',
            "dropdown_width" => 'auto',
            "has_zip_codes" => '1',
            "header" => '1',
            "format_key" => '',
            "time_format" => 'h:mm a',
            "exclude_zip_codes" => null,
            "show_distance" => '0',
            "distance_search" => '0',
            "distance_units" => 'mi',
            "custom_query" => null,
            "show_map" => '0',
            "max_zoom_level" => 15,
            "language" => 'en-US',
            'strict_datafields' => false,
            'meeting_details_href' => '',
            'virtual_meeting_details_href' => '',
            "auto_tz_adjust" => '0',
            "base_tz" => null,
            "sort_keys" => 'start_time',
            "int_start_day_id" => '1',
            "recurse_service_bodies" => '0',
            "theme" => '',
            "map_search" => null,
            "map_search_zoom" => 10,
            "map_search_latitude" => 0,
            "map_search_longitude" => 0,
            "map_search_width" => '-50',
            "map_search_auto" => true,
            "map_search_location" => null,
            "map_search_coordinates_search" => false,
            "default_filter_dropdown" => '',
            "meeting_data_template" => null,
            "metadata_template" => null,
            "filter_tabs" => false,
            "show_qrcode" => false,
            "hide_byday_headers" => false,
            "native_lang" => '',
            "has_meeting_count" => false
        );

        public function __construct()
        {
            $this->getOptions();
            if (is_admin()) {
                // Back end
                add_action("admin_notices", array(&$this, "isRootServerMissing"));
                add_action("admin_enqueue_scripts", array(&$this, "enqueueBackendFiles"), 500);
                add_action("admin_menu", array(&$this, "adminMenuLink"));
                add_filter('wp_editor_settings', array(&$this, "disableTinyMCE"), 100, 2);
            } else {
                // Front end
                add_action("wp_enqueue_scripts", array(&$this, "enqueueFrontendFiles"));
                add_shortcode('init_crouton', array(
                    &$this,
                    "initCrouton"
                ));
                add_shortcode('bmlt_tabs', array(
                    &$this,
                    "tabbedUi"
                ));
                add_shortcode('crouton_map', array(
                    &$this,
                    "croutonMap"
                ));
                add_shortcode('bmlt_count', array(
                    &$this,
                    "meetingCount"
                ));
                add_shortcode('meeting_count', array(
                    &$this,
                    "meetingCount"
                ));
                add_shortcode('group_count', array(
                    &$this,
                    "groupCount"
                ));
                add_shortcode('service_body_names', array(
                    &$this,
                    "serviceBodyNames"
                ));
                add_shortcode('bmlt_handlebar', array(
                    &$this,
                    "bmltHandlebar"
                ));
                add_filter('the_content', array(&$this, "disableWpautop"), 0);
            }
        }

        public function hasShortcode()
        {
            $post_to_check = get_post(get_the_ID());
            $post_content = $post_to_check->post_content ?? '';
            // check the post content for the short code
            if (stripos($post_content, '[bmlt_tabs') !== false) {
                echo '<div class="bootstrap-bmlt" id="please-wait"><button class="btn btn-lg btn-info"><span class="glyphicon glyphicon-repeat glyphicon-repeat-animate"></span>Fetching...</button></div>';
                return true;
            }
            if (stripos($post_content, '[crouton_map') !== false) {
                return true;
            }
            if (stripos($post_content, '[bmlt_count') !== false) {
                return true;
            }
            if (stripos($post_content, '[meeting_count') !== false) {
                return true;
            }
            if (stripos($post_content, '[group_count') !== false) {
                return true;
            }
            if (stripos($post_content, '[service_body_names') !== false) {
                return true;
            }
            if (stripos($post_content, '[bmlt_handlebar') !== false) {
                return true;
            }
            return false;
        }

        public function isRootServerMissing()
        {
            add_action("admin_notices", array(
                &$this,
                "clearAdminMessage"
            ));
        }

        public function clearAdminMessage()
        {
            remove_action("admin_notices", array(
                &$this,
                "isRootServerMissing"
            ));
        }
        // phpcs:disable PSR1.Methods.CamelCapsMethodName.NotCamelCaps
        public function Crouton()
        {
        // phpcs:enable PSR1.Methods.CamelCapsMethodName.NotCamelCaps
            $this->__construct();
        }
        public function disableTinyMCE($settings, $editor_id)
        {
            if ($editor_id === 'content' && get_post_meta(get_the_ID(), '_crouton_disable_tinyMCE', true)) {
                $settings['tinymce']   = false;
                $settings['quicktags'] = false;
                $settings['media_buttons'] = false;
            }
        
            return $settings;
        }
        public function disableWpautop($content)
        {
            if (get_post_meta(get_the_ID(), '_crouton_disable_tinyMCE')) {
                remove_filter('the_content', 'wpautop');
            }
            return $content;
        }
        public function includeToString($file)
        {
            ob_start();
            include($file);
            return ob_get_clean();
        }

        public function enqueueBackendFiles($hook)
        {
            if ($hook == 'settings_page_crouton') {
                wp_enqueue_style('bmlt-tabs-admin-ui-css', plugins_url('css/south-street/jquery-ui.css', __FILE__), false, '1.11.4', false);
                wp_enqueue_style("chosen", plugin_dir_url(__FILE__) . "css/chosen.min.css", false, "1.2", 'all');
                wp_enqueue_style("crouton-admin", plugin_dir_url(__FILE__) . "css/crouton-admin.css", false, "1.1", 'all');
                wp_enqueue_script("chosen", plugin_dir_url(__FILE__) . "js/chosen.jquery.min.js", array('jquery'), "1.2", true);
                wp_enqueue_script('bmlt-tabs-admin', plugins_url('js/bmlt_tabs_admin.js', __FILE__), array('jquery'), filemtime(plugin_dir_path(__FILE__) . "js/bmlt_tabs_admin.js"), false);
                wp_enqueue_script("tooltipster", plugin_dir_url(__FILE__) . "js/jquery.tooltipster.min.js", array('jquery'), "1.2", true);
                wp_enqueue_script('common');
                wp_enqueue_script('jquery-ui-accordion');
                wp_enqueue_script("crouton-default-templates", plugin_dir_url(__FILE__) . "croutonjs/src/js/crouton-default-templates.js", array('jquery'), filemtime(plugin_dir_path(__FILE__) . "croutonjs/src/js/crouton-default-templates.js"), true);
            }
        }

        /**
        * @desc Adds JS/CSS to the header
        */
        public function enqueueFrontendFiles()
        {
            if ($this->hasShortcode()) {
                $jsfilename = (isset($_GET['croutonjsdebug']) ? "crouton.nojquery.js" : "crouton.nojquery.min.js");
                wp_enqueue_style("croutoncss", plugin_dir_url(__FILE__) . "croutonjs/dist/crouton.min.css", false, filemtime(plugin_dir_path(__FILE__) . "croutonjs/dist/crouton.min.css"), false);
                wp_enqueue_script("croutonjs", plugin_dir_url(__FILE__) . "croutonjs/dist/$jsfilename", array('jquery'), filemtime(plugin_dir_path(__FILE__) . "croutonjs/dist/$jsfilename"), true);
            }
        }

        public function getNameFromServiceBodyID($serviceBodyID)
        {
            $bmlt_search_endpoint =  wp_remote_get($this->options['root_server'] . "/client_interface/json/?switcher=GetServiceBodies", Crouton::HTTP_RETRIEVE_ARGS);
            $serviceBodies = json_decode(wp_remote_retrieve_body($bmlt_search_endpoint));
            foreach ($serviceBodies as $serviceBody) {
                if ($serviceBody->id == $serviceBodyID) {
                    return $serviceBody->name;
                }
            }
        }
        public function getMeetingsJson($url)
        {
            $results = wp_remote_get($url, Crouton::HTTP_RETRIEVE_ARGS);
            $httpcode = wp_remote_retrieve_response_code($results);
            $response_message = wp_remote_retrieve_response_message($results);
            if ($httpcode != 200 && $httpcode != 302 && $httpcode != 304 && ! empty($response_message)) {
                echo "<p style='color: #FF0000;'>Problem Connecting to BMLT Root Server: $url</p>";
                return 0;
            }
            $result = wp_remote_retrieve_body($results);
            if ($result == null || count(json_decode($result)) == 0) {
                echo "<p style='color: #FF0000;'>No Meetings were Found: $url</p>";
                return 0;
            }
            return $result;
        }

        public function getCustomQuery($custom_query)
        {
            if (isset($_GET['custom_query'])) {
                return $_GET['custom_query'];
            } elseif (isset($this->options['custom_query']) && strlen($this->options['custom_query']) > 0) {
                return $this->options['custom_query'];
            } elseif (isset($custom_query) && $custom_query != null) {
                return html_entity_decode($custom_query);
            } else {
                return null;
            }
        }

        public function testRootServer($root_server)
        {
            $args = array(
                'timeout' => '10',
                'headers' => array(
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:105.0) Gecko/20100101 Firefox/105.0 +crouton'
                )
            );
            $results = wp_remote_get("$root_server/client_interface/json/?switcher=GetServerInfo", $args);
            $httpcode = wp_remote_retrieve_response_code($results);
            $response_message = wp_remote_retrieve_response_message($results);
            if ($httpcode != 200 && $httpcode != 302 && $httpcode != 304 && ! empty($response_message)) {
                //echo '<p>Problem Connecting to BMLT Root Server: ' . $root_server . '</p>';
                return false;
            };

            $results = json_decode(wp_remote_retrieve_body($results), true);

            if (is_array($results) && !empty($results)) {
                return $results[0]['version'] ?? '';
            }

            return '';
        }

        public function doQuit($message = '')
        {
            ob_flush();
            flush();
            $message .= '<script>document.getElementById("please-wait").style.display = "none";</script>';
            return $message;
        }

        public function sharedRender()
        {
            $output = "";
            if (isset($_GET['this_title'])) {
                $output .= '<div class="bmlt_tabs_title">' . $_GET['this_title'] . '</div>';
            } else {
                $output .= $sub_title = $meeting_count = $group_count= '';
            }

            if (isset($_GET['sub_title'])) {
                $output .= '<div class="bmlt_tabs_sub_title">' . $_GET['sub_title'] . '</div>';
            }

            return $output;
        }

        public function tabbedUi($atts, $content = null)
        {
            return sprintf('%s<div id="bmlt-tabs" class="bmlt-tabs hide">%s</div><script>document.getElementById("please-wait").style.display = "none";</script>', $this->sharedRender(), $this->renderTable($atts));
        }
        public function bmltHandlebar($atts, $template = null)
        {
            if (!isset($_GET['meeting-id'])) {
                return "Meeting-ID not set in query-string";
            }
            if ($template == null || trim($template) == '') {
                if (isset($atts['template']) && strlen(trim($atts['template'])) > 0) {
                    $template = trim($atts['template']);
                } else {
                    return '';
                }
            }
            if (!$this->has_handlebars) {
                add_action("wp_footer", [$this,'handlebarFooter']);
            }
            $this->has_handlebars = true;
            return sprintf('<bmlt-handlebar><div style="display:none;">%s</div>Fetching...</bmlt-handlebar>', htmlspecialchars($template));
        }
        public function croutonMap($atts, $content = null)
        {
            return sprintf('%s<div id="bmlt-tabs" class="bmlt-tabs hide">%s</div>', $this->sharedRender(), $this->renderMap($atts));
        }

        public function getInitializeCroutonBlock($config = array())
        {
            if (!$this->croutonBlockInitialized) {
                $this->croutonBlockInitialized = true;
                return "<script type='text/javascript'>var crouton;jQuery(document).ready(function() { crouton = new Crouton($config); });</script>";
            } else {
                return isset($config) ? "<script type='text/javascript'>jQuery(document).ready(function() { crouton.setConfig($config); });</script>" : "";
            }
        }

        public function renderTable($atts)
        {
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts)) . "<script type='text/javascript'>jQuery(document).ready(function() { crouton.render(); })</script>";
        }

        public function renderMap($atts)
        {
            if ($atts == null) {
                $atts = array();
            }
            $atts['map_search'] = (object)[
                "zoom" => isset($atts['map_search_zoom'])
                    ? intval($atts['map_search_zoom'])
                    : $this->shortCodeOptions['map_search_zoom'],
                "latitude" => isset($atts['map_search_latitude'])
                    ? intval($atts['map_search_latitude'])
                    : $this->shortCodeOptions['map_search_latitude'],
                "longitude" => isset($atts['map_search_longitude'])
                    ? intval($atts['map_search_longitude'])
                    : $this->shortCodeOptions['map_search_longitude'],
                "width" => isset($atts['map_search_width'])
                    ? intval($atts['map_search_width'])
                    : $this->shortCodeOptions['map_search_width'],
                "auto" => isset($atts['map_search_auto'])
                    ? boolval($atts['map_search_auto'])
                    : $this->shortCodeOptions['map_search_auto'],
                "location" => isset($atts['map_search_location'])
                    ? $atts['map_search_location']
                    : $this->shortCodeOptions['map_search_location'],
                "coordinates_search" => isset($atts['map_search_coordinates_search'])
                    ? boolval($atts['map_search_coordinates_search'])
                    : $this->shortCodeOptions['map_search_coordinates_search']
            ];
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts));
        }

        public function initCrouton($atts)
        {
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts));
        }

        public function meetingCount($atts)
        {
            $random_id = rand(10000, 99999);
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts)) . "<script type='text/javascript'>jQuery(document).ready(function() { crouton.meetingCount(function(res) { document.getElementById('meeting-count-$random_id').innerHTML = res; }) })</script><span id='meeting-count-$random_id'></span>";
        }

        public function groupCount($atts)
        {
            $random_id = rand(10000, 99999);
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts)) . "<script type='text/javascript'>jQuery(document).ready(function() { crouton.groupCount(function(res) { document.getElementById('group-count-$random_id').innerHTML = res; }) })</script><span id='group-count-$random_id'></span>";
        }

        public function serviceBodyNames($atts)
        {
            $random_id = rand(10000, 99999);
            return $this->getInitializeCroutonBlock($this->getCroutonJsConfig($atts)) . "<script type='text/javascript'>jQuery(document).ready(function() { crouton.serviceBodyNames(function(res) { document.getElementById('service-body-names-$random_id').innerHTML = res; }) })</script><span id='service-body-names-$random_id'></span>";
        }
        public function handlebarFooter()
        {
            if (!isset($_GET['meeting-id'])) {
                return;
            }
            $meetingId = $_GET['meeting-id'];
            $attr = ['custom_query' => '&meeting_ids[]='.$meetingId,
                     'strict_datafields' => false];
            $config = $this->getCroutonJsConfig($attr);
            ?>
<script type='text/javascript'>
var crouton;

jQuery(document).ready(function() { 
    crouton = new Crouton(<?php echo $config; ?>);
    crouton.doHandlebars();
});
</script>
            <?php
        }
        /**
         * @desc Adds the options sub-panel
         */
        public function getAreas($root_server, $source)
        {
            $results = wp_remote_get("$root_server/client_interface/json/?switcher=GetServiceBodies", Crouton::HTTP_RETRIEVE_ARGS);
            $result = json_decode(wp_remote_retrieve_body($results), true);
            if (is_wp_error($results)) {
                echo '<div style="font-size: 20px;text-align:center;font-weight:normal;color:#F00;margin:0 auto;margin-top: 30px;"><p>Problem Connecting to BMLT Root Server</p><p>' . $root_server . '</p><p>Error: ' . $result->get_error_message() . '</p><p>Please try again later</p></div>';
                return 0;
            }

            if ($source == 'dropdown') {
                $unique_areas = array();
                foreach ($result as $value) {
                    $parent_name = 'None';
                    foreach ($result as $parent) {
                        if ($value['parent_id'] == $parent['id']) {
                            $parent_name = $parent['name'];
                        }
                    }
                    $unique_areas[] = $value['name'] . ',' . $value['id'] . ',' . $value['parent_id'] . ',' . $parent_name;
                }
            } else {
                $unique_areas = array();
                foreach ($result as $value) {
                    $unique_areas[$value['id']] = $value['name'];
                }
            }
            return $unique_areas;
        }

        public function adminMenuLink()
        {
            // If you change this from add_options_page, MAKE SURE you change the filterPluginActions function (below) to
            // reflect the page file name (i.e. - options-general.php) of the page your plugin is under!
            add_options_page('crouton', 'crouton', 'activate_plugins', basename(__FILE__), array(
                &$this,
                'adminOptionsPage'
            ));
            add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(
                &$this,
                'filterPluginActions'
            ), 10, 2);
        }
        public function createMeetingDetailsPage($page, $title = "Meeting Details")
        {
            $create_message = '';
            $meeting_details_id = (strlen($this->options[$page]) > 0)  ? url_to_postid($this->options[$page]) : 0;
            if (strlen($this->options[$page]) > 0 && $meeting_details_id === 0) {
                if (isset($_POST['create_default_page'])) {
                    $contents = file_get_contents(plugin_dir_path(__FILE__) . "partials/default_meeting_details.html");
                    $slug = basename(parse_url($this->options[$page], PHP_URL_PATH));
                    $post_details = array(
                        'post_title'    => $title,
                        'post_name'     => $slug,
                        'post_content'  => $contents,
                        'post_status'   => 'publish',
                        'post_author'   => get_current_user_id(),
                        'post_type' => 'page'
                    );
                    $res = wp_insert_post($post_details);
                    if (is_wp_error($res)) {
                        $create_message = "<div class='page-insert-error'>Could not create default $title page:<br/>"
                            .$res->get_error_message().'</div>';
                    } else {
                        $meeting_details_id = $res;
                        $this->options[$page] = rtrim(parse_url(get_permalink($meeting_details_id))['path'], '/');
                        $create_message = "<div class='page-insert-ok'>$title page created</div>";
                    }
                }
            }
            if ($meeting_details_id > 0) {
                if (isset($_POST['disable_tinyMCE'])) {
                    update_post_meta($meeting_details_id, '_crouton_disable_tinyMCE', 1);
                } else {
                    delete_post_meta($meeting_details_id, '_crouton_disable_tinyMCE');
                }
            }
            return $create_message;
        }
        /**
         * Adds settings/options page
         */
        public function adminOptionsPage()
        {
            $create_message = '';
            if (!isset($_POST['bmlttabssave'])) {
                $_POST['bmlttabssave'] = false;
            }
            if ($_POST['bmlttabssave']) {
                if (!wp_verify_nonce($_POST['_wpnonce'], 'bmlttabsupdate-options')) {
                    die('Whoops! There was a problem with the data you posted. Please go back and try again.');
                }
                $this->options['root_server']    = $_POST['root_server'];
                $this->options['service_body_1'] = $_POST['service_body_1'];
                $this->options['time_format'] = $_POST['time_format'];
                $this->options['language'] = $_POST['language'];
                $this->options['strict_datafields'] = isset($_POST['strict_datafields']);
                $this->options["int_start_day_id"] = intval($_POST["int_start_day_id"]);
                $this->options['native_lang'] = trim($_POST['native_lang']);
                $this->options['meeting_details_href'] = trim($_POST['meeting_details_href']);
                $this->options['virtual_meeting_details_href'] = trim($_POST['virtual_meeting_details_href']);
                $this->options['custom_query']   = $_POST['custom_query'];
                $this->options['custom_css']     = isset($_POST['custom_css']) ? str_replace('\\', '', $_POST['custom_css']) : "";
                $this->options['meeting_data_template'] = isset($_POST['meeting_data_template']) ? str_replace('\\', '', $_POST['meeting_data_template']) : "";
                $this->options['metadata_template'] = isset($_POST['metadata_template']) ? str_replace('\\', '', $_POST['metadata_template']) : "";
                $this->options['theme']          = $_POST['theme'];
                $this->options['recurse_service_bodies'] = isset($_POST['recurse_service_bodies']) ? $_POST['recurse_service_bodies'] : "0";
                $this->options['extra_meetings'] = isset($_POST['extra_meetings']) ? $_POST['extra_meetings'] : array();
                $this->options['extra_meetings_enabled'] = isset($_POST['extra_meetings_enabled']) ? intval($_POST['extra_meetings_enabled']) : "0";
                $this->options['google_api_key'] = $_POST['google_api_key'];
                $this->options['google_api_key'] = $_POST['google_api_key'];
                $this->options['disable_tinyMCE'] = isset($_POST['disable_tinyMCE']);
                $create_message = $this->createMeetingDetailsPage('meeting_details_href', "Meeting Details");
                $create_message .= $this->createMeetingDetailsPage('virtual_meeting_details_href', "Virtual_Meeting Details");
                $this->saveAdminOptions();
                echo "<script type='text/javascript'>jQuery(function(){jQuery('#updated').html('<p>Success! Your changes were successfully saved!</p>').show().fadeOut(5000);});</script>";
            }
            if (!isset($this->options['time_format']) || strlen(trim($this->options['time_format'])) == 0) {
                $this->options['time_format'] = 'h:mm a';
            }
            if (!isset($this->options['language']) || strlen(trim($this->options['language'])) == 0) {
                $this->options['language'] = 'en-US';
            }
            if (!isset($this->options['native_lang'])) {
                $this->options['native_lang'] = '';
            }
            if (!isset($this->options['meeting_details_href'])) {
                $this->options['meeting_details_href'] = '';
            }
            if (!isset($this->options['virtual_meeting_details_href'])) {
                $this->options['virtual_meeting_details_href'] = '';
            }
            if (!isset($this->options['strict_datafields'])) {
                $this->options['strict_datafields'] = true;
            }
            if (!isset($this->options['extra_meetings_enabled']) || $this->options['extra_meetings_enabled'] == "0" || strlen(trim($this->options['extra_meetings_enabled'])) == 0) {
                $this->options['extra_meetings_enabled'] = 0;
            }
            if (!isset($this->options['extra_meetings']) || count($this->options['extra_meetings']) == 0) {
                $this->options['extra_meetings'] = '';
            } else {
                $this->options['extra_meetings_enabled'] = 1;
            }
            if (!isset($this->options['disable_tinyMCE'])) {
                $this->options['disable_tinyMCE'] = false;
            }
            ?>
            <div class="wrap">
                <div id="tallyBannerContainer">
                    <img alt="crouton-banner" id="tallyBannerImage" src="<?php echo plugin_dir_url(__FILE__); ?>css/images/banner.png"/>
                </div>
                <div id="updated"></div>
                <form style="display:inline!important;" method="POST" id="bmlt_tabs_options" name="bmlt_tabs_options">
                    <?php
                    wp_nonce_field('bmlttabsupdate-options');
                    $this_connected = $this->testRootServer($this->options['root_server']);
                    $connect = "<p><div style='color: #f00;font-size: 16px;vertical-align: text-top;' class='dashicons dashicons-no'></div><span style='color: #f00;'>Connection to Root Server Failed.  Check spelling or try again.  If you are certain spelling is correct, Root Server could be down.</span></p>";
                    if ($this_connected != false) {
                        $connect = "<span style='color: #00AD00;'><div style='font-size: 16px;vertical-align: text-top;' class='dashicons dashicons-smiley'></div>Version ".$this_connected."</span>";
                        $this_connected = true;
                    }?>
                    <div style="margin-top: 20px; padding: 0 15px;" class="postbox">
                        <h3>Configuration</h3>
                        <p>Please open a ticket <a href="https://github.com/bmlt-enabled/crouton/issues" target="_blank">https://github.com/bmlt-enabled/crouton/issues</a> for bugs, enhancements, or questions.</p>
                        <ul class="configuration-toc">
                            <li><a href="#config-bmlt-root-server">BMLT Root Server</a></li>
                            <li><a href="#config-service-body">Service Body</a></li>
                            <li><a href="#config-include-extra-meetings">Include Extra Meetings</a></li>
                            <li><a href="#config-custom-query">Custom Query</a></li>
                            <li><a href="#config-meeting-data-template">Meeting Data Template</a></li>
                            <li><a href="#config-metadata-data-template">Metadata Template</a></li>
                            <li><a href="#config-theme">Theme</a></li>
                            <li><a href="#config-custom-css">Custom CSS</a></li>
                            <li><a href="#config-google-api-key">Google API Key</a></li>
                            <li><a href="#config-documentation">Documentation</a></li>
                        </ul>
                    </div>
                    <div style="margin-top: 20px; padding: 0 15px;" class="postbox">
                        <h3><a id="config-bmlt-root-server" class="anchor"></a>BMLT Root Server URL</h3>
                        <p>Example: https://bmlt.sezf.org/main_server</p>
                        <ul>
                            <li>
                                <label for="root_server">Default Root Server: </label>
                                <input id="root_server" type="text" size="50" name="root_server" value="<?php echo $this->options['root_server']; ?>" /> <?php echo $connect; ?>
                            </li>
                            <li>
                                <input type="checkbox" id="use_aggregator" name="use_aggregator" value="1"/>
                                <label for="use_aggregator">Use Aggregator &#127813;</label>
                                <span title='<p>The Aggregator collects meeting data <br/>from all known root servers and pretends to be one large server</p><p>This can be useful to use if you want to display meetings outside <br/>of your server, for instance a statewide listing where the state <br/>covers multiple root servers<br/>Another good use case is if you want to display meetings by users<br/> location</p>' class="tooltip"></span>
                            </li>
                        </ul>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-service-body" class="anchor"></a>Service Body</h3>
                        <p>This service body will be used when no service body is defined in the shortcode.</p>
                        <ul>
                            <li>
                                <label for="service_body_1">Default Service Body: </label>
                                <select style="display:inline;" onchange="getValueSelected()" id="service_body_1" name="service_body_1"  class="service_body_select">
                                <?php if ($this_connected) {
                                    $unique_areas = $this->getAreas($this->options['root_server'], 'dropdown');
                                    asort($unique_areas, SORT_NATURAL | SORT_FLAG_CASE);
                                    foreach ($unique_areas as $key => $unique_area) {
                                        $area_data = explode(',', $unique_area);
                                        $area_name = $area_data[0];
                                        $area_id = $area_data[1];
                                        $area_parent = $area_data[2];
                                        $area_parent_name = $area_data[3];
                                        $option_description = $area_name . " (" . $area_id . ") " . $area_parent_name . " (" . $area_parent . ")";
                                        $is_data = explode(',', esc_html($this->options['service_body_1']));
                                        if ($area_id == $is_data[1]) {?>
                                            <option selected="selected" value="<?php echo $unique_area; ?>"><?php echo $option_description; ?></option>
                                        <?php } else { ?>
                                            <option value="<?php echo $unique_area; ?>"><?php echo $option_description; ?></option>
                                        <?php } ?>
                                    <?php } ?>
                                <?php } else { ?>
                                    <option selected="selected" value="<?php echo $this->options['service_body_1']; ?>"><?php echo 'Not Connected - Can not get Service Bodies'; ?></option>
                                <?php } ?>
                                </select>
                                <div style="display:inline; margin-left:15px;" id="txtSelectedValues1"></div>
                                <p id="txtSelectedValues2"></p>
                                <input type="checkbox" id="recurse_service_bodies" name="recurse_service_bodies" value="1" <?php echo (isset($this->options['recurse_service_bodies']) && $this->options['recurse_service_bodies'] == "1" ? "checked" : "") ?>/>
                                <label for="recurse_service_bodies">Recurse Service Bodies</label>
                            </li>
                        </ul>
                    </div>
                    <div style="margin-top: 20px; padding: 0 15px;" class="postbox">
                        <h3><a id="config-default-options" class="anchor"></a>Default Values</h3>
                        <p>These values will be used when the attributes are not defined in the shortcode</p>
                        <ul>
                            <li>
                                <label for="language">Default language of Crouton UI: </label>
                                <input id="language" type="text" size="5" name="language" value="<?php echo $this->options['language']; ?>" />
                            </li>
                            <li>
                                <label for="native_lang">Default language of meetings (format code): </label>
                                <input id="native_lang" type="text" size="2" name="native_lang" value="<?php echo $this->options['native_lang']; ?>" />
                            </li>
                            <li>
                                <label for="time_format">Default time format: </label>
                                <input id="time_format" type="text" size="10" name="time_format" value="<?php echo $this->options['time_format']; ?>" />
                            </li>
                            <li>
                                <?php
                                if (!isset($this->options["int_start_day_id"])) {
                                    $this->options["int_start_day_id"] = 1;
                                }
                                ?>
                                <label for="int_start_day_id">Which day does the week start on:</label>
                                <select name="int_start_day_id" id="int_start_day_id">
                                    <option value="1" <?php echo ($this->options["int_start_day_id"] == 1) ? 'selected' : ''; ?>>Sunday</option>
                                    <option value="2" <?php echo ($this->options["int_start_day_id"] == 2) ? 'selected' : ''; ?>>Monday</option>
                                    <option value="3" <?php echo ($this->options["int_start_day_id"] == 3) ? 'selected' : ''; ?>>Tuesday</option>
                                    <option value="4" <?php echo ($this->options["int_start_day_id"] == 4) ? 'selected' : ''; ?>>Wedsday</option>
                                    <option value="5" <?php echo ($this->options["int_start_day_id"] == 5) ? 'selected' : ''; ?>>Thursday</option>
                                    <option value="6" <?php echo ($this->options["int_start_day_id"] == 6) ? 'selected' : ''; ?>>Friday</option>
                                    <option value="7" <?php echo ($this->options["int_start_day_id"] == 7) ? 'selected' : ''; ?>>Saturday</option>
                                </select>
                            </li>
                            <li>
                                <input type="checkbox" id="strict_datafields" name="strict_datafields" <?php echo $this->options['strict_datafields'] ? "checked" : '' ?>/>
                                <label for="strict_datafields">Retrieve only those fields that are directly accessed in the templates</label>
                            </li>
                        </ul>
                    </div>
                    <div style="margin-top: 20px; padding: 0 15px;" class="postbox">
                        <h3><a id="config-meeting-details-href" class="anchor"></a>Meeting Detail Pages</h3>
                        <p>Link to pages where the [bmlt_handlebar] tag is used to insert information about a particular meeting, in more detail and in an
                            easier to read format than is possible in the crouton table.  Use the partial {{> meetingLink this}} to insert into a template.
                        </p>
                        <ul>
                            <li>
                                <label for="meeting_details_href">URI for in-person (and hybrid) meetings: </label>
                                <input id="meeting_details_href" type="text" size="50" name="meeting_details_href" value="<?php echo $this->options['meeting_details_href']; ?>" onkeyup='show_create_detail_option(this)'/>
                            </li>
                            <li>
                                <label for="virtual_meeting_details_href">URI for virtual meetings: </label>
                                <input id="virtual_meeting_details_href" type="text" size="50" name="virtual_meeting_details_href" value="<?php echo $this->options['virtual_meeting_details_href']; ?>" onkeyup='show_create_detail_option(this)'/>
                                <p>If no value is specified for virtual meetings, the in-person meeting link will be used.</p>
                            </li>
                            <li>
                                <div id="meeting_details_options" style="margin-bottom:5px;">
                                    <?php if ($create_message) {
                                        echo $create_message;
                                    } ?>
                                </div>
                                <input type="checkbox" id="disable_tinyMCE" name="disable_tinyMCE" <?php echo ($this->options['disable_tinyMCE']) ? 'checked': ''; ?>>
                                <label for="disable_tinyMCE">Disable visual (WYSIWYG) editor when editing template. (recommended).</label>
                            </li>
                        </ul>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-include-extra-meetings" class="anchor"></a>Include Extra Meetings</h3>
                        <div class="inside">
                            <p class="ctrl_key" style="display:none; color: #00AD00;">Hold CTRL Key down to select multiple meetings.</p>
                            <select class="chosen-select" style="width: 100%;" data-placeholder="<?php
                            if ($this->options['extra_meetings_enabled'] == 0) {
                                echo 'Not Enabled';
                            } elseif (!$this_connected) {
                                echo 'Not Connected';
                            } else {
                                echo 'Select Extra Meetings';
                            } ?>" id="extra_meetings" name="extra_meetings[]" multiple="multiple">
                                <?php if ($this_connected && $this->options['extra_meetings_enabled'] == 1) {
                                    $extra_meetings_array = $this->getAllMeetings($this->options['root_server']);
                                    foreach ($extra_meetings_array as $extra_meeting) {
                                        $extra_meeting_x = explode('|||', $extra_meeting);
                                        $extra_meeting_id = $extra_meeting_x[3];
                                        $extra_meeting_display = substr($extra_meeting_x[0], 0, 30) . ' ' . $extra_meeting_x[1] . ' ' . $extra_meeting_x[2] . $extra_meeting_id; ?>
                                        <option <?php echo ($this->options['extra_meetings'] != '' && in_array($extra_meeting_id, $this->options['extra_meetings']) ? 'selected="selected"' : '') ?> value="<?php echo $extra_meeting_id ?>"><?php echo esc_html($extra_meeting_display) ?></option>
                                        <?php
                                    }
                                } ?>
                            </select>
                            <p>Hint: Type a group name, weekday, area or id to narrow down your choices.</p>
                            <div>
                                <input type="checkbox" name="extra_meetings_enabled" value="1" <?php echo ($this->options['extra_meetings_enabled'] == 1 ? 'checked' : '') ?> /> Extra Meetings Enabled
                            </div>
                        </div>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-custom-query" class="anchor"></a>Custom Query</h3>
                        <p>This will allow to specify a custom BMLT query.  This will override any other filtering including service bodies.</p>
                        <ul>
                            <li>
                                <label for="custom_query">Custom Query: </label>
                                <input id="custom_query" name="custom_query" size="50" value="<?php echo (isset($this->options['custom_query']) ? $this->options['custom_query'] : ""); ?>" />
                            </li>
                        </ul>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-meeting-data-template" class="anchor"></a>Meeting Data Template</h3>
                        <p>This allows a customization of the meeting data template.  A list of available fields are here <a target="_blank" href="<?php echo $this->options['root_server']?>/client_interface/json/?switcher=GetFieldKeys">here</a>.)</p>
                        <ul>
                            <li>
                                <textarea id="meeting_data_template" name="meeting_data_template" cols="100" rows="10"><?php echo isset($this->options['meeting_data_template']) ? html_entity_decode($this->options['meeting_data_template']) : "___DEFAULT___"; ?></textarea>
                            </li>
                            <li>
                                <input type="button" id="reset_meeting_data_template" value="RESET TO DEFAULT" class="button-secondary" />
                            </li>
                        </ul>
                        <script type="text/javascript">
                            jQuery("document").ready(function() {
                                var meeting_data_template = jQuery("#meeting_data_template").val();
                                jQuery("#meeting_data_template").val(meeting_data_template.replace("___DEFAULT___", croutonDefaultTemplates.meeting_data_template));
                            });

                            jQuery("#reset_meeting_data_template").click(function() {
                                jQuery('#meeting_data_template').val(croutonDefaultTemplates.meeting_data_template);
                            });
                        </script>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-metadata-data-template" class="anchor"></a>Metadata Template</h3>
                        <p>This allows a customization of the metadata template (3rd column).  A list of available fields are here <a target="_blank" href="<?php echo $this->options['root_server']?>/client_interface/json/?switcher=GetFieldKeys">here</a>.)</p>
                        <ul>
                            <li>
                                <textarea id="metadata_template" name="metadata_template" cols="100" rows="10"><?php echo isset($this->options['metadata_template']) ? html_entity_decode($this->options['metadata_template']) : "___DEFAULT___"; ?></textarea>
                            </li>
                            <li>
                                <input type="button" id="reset_metadata_template" value="RESET TO DEFAULT" class="button-secondary" />
                            </li>
                        </ul>
                        <script type="text/javascript">
                            jQuery("document").ready(function() {
                                var metadata_template = jQuery("#metadata_template").val();
                                jQuery("#metadata_template").val(metadata_template.replace("___DEFAULT___", croutonDefaultTemplates.metadata_template));
                            });

                            jQuery("#reset_metadata_template").click(function() {
                                jQuery('#metadata_template').val(croutonDefaultTemplates.metadata_template);
                            });
                        </script>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-theme" class="anchor"></a>Theme</h3>
                        <p>Allows for setting a pre-packaged theme.  (Have a custom built theme?  Please submit your CSS <a target="_blank" href="https://github.com/bmlt-enabled/crouton/issues/new?assignees=&labels=theme&template=custom-theme-template.md&title=Custom+Theme+Submission+Request">here</a>.)</p>
                        <ul>
                            <li><p><b>The default original theme is called "jack".  If no theme is selected, the default one will be used.</b></p></li>
                            <li>
                                <select style="display:inline;" id="theme" name="theme"  class="theme_select">
                                    <?php
                                    foreach ($this->themes as $theme) { ?>
                                        <option <?php if ($theme === $this->options['theme']) {
                                                    echo "selected";
                                                } else {
                                                    echo "";
                                                }
                                                ?> value="<?php echo $theme ?>"><?php echo $theme == "jack" ? "jack (default)" : $theme ?></option>
                                        <?php
                                    }?>
                                </select>
                            </li>
                        </ul>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-custom-css" class="anchor"></a>Custom CSS</h3>
                        <p>Allows for custom styling of your crouton.</p>
                        <ul>
                            <li>
                                <textarea id="custom_css" name="custom_css" cols="100" rows="10"><?php echo (isset($this->options['custom_css']) ? html_entity_decode($this->options['custom_css']) : ""); ?></textarea>
                            </li>
                        </ul>
                    </div>
                    <div style="padding: 0 15px;" class="postbox">
                        <h3><a id="config-google-api-key" class="anchor"></a>Google API Key</h3>
                        <p>This is only needed when using the companion map feature show_map.</p>
                        <ul>
                            <li>
                                <label for="google_api_key">API Key: </label>
                                <input id="google_api_key" name="google_api_key" size="50" value="<?php echo (isset($this->options['google_api_key']) ? $this->options['google_api_key'] : ""); ?>" />
                            </li>
                        </ul>
                        <p>You must have the 'Google Maps JavaScript API' enabled on your key. <br> For more information on setting up and configuring a Google Maps API key check out this blog article <br> <a target="_blank" href="https://bmlt.app/google-api-key/">https://bmlt.app/google-api-key/</a></p>
                    </div>
                    <input type="submit" value="SAVE CHANGES" name="bmlttabssave" class="button-primary" />
                </form>
                <br/><br/>
                <?php include 'partials/_instructions.php'; ?>
            </div>
            <script type="text/javascript">getValueSelected();</script>
            <?php
        }
        /**
         * @desc Adds the Settings link to the plugin activate/deactivate page
         */
        public function filterPluginActions($links, $file)
        {
            // If your plugin is under a different top-level menu than Settings (IE - you changed the function above to something other than add_options_page)
            // Then you're going to want to change options-general.php below to the name of your top-level page
            $settings_link = '<a href="options-general.php?page=' . basename(__FILE__) . '">' . __('Settings') . '</a>';
            array_unshift($links, $settings_link);
            // before other links
            return $links;
        }
        /**
         * Retrieves the plugin options from the database.
         * @return array
         */
        public function getOptions()
        {
            // Don't forget to set up the default options
            if (!$theOptions = get_option($this->optionsName)) {
                $theOptions = array(
                    'root_server' => '',
                    'service_body_1' => ''
                );
                update_option($this->optionsName, $theOptions);
            }
            $this->options = $theOptions;
            $this->options['root_server'] = untrailingslashit(preg_replace('/^(.*)\/(.*php)$/', '$1', $this->options['root_server']));
        }
        /**
         * Saves the admin options to the database.
         */
        public function saveAdminOptions()
        {
            $this->options['root_server'] = untrailingslashit(preg_replace('/^(.*)\/(.*php)$/', '$1', $this->options['root_server']));
            update_option($this->optionsName, $this->options);
            return;
        }

        /**
         * @param $root_server
         * @return string
         */
        public function getAllMeetings($root_server)
        {
            $results = wp_remote_get($root_server . "/client_interface/json/?switcher=GetSearchResults&data_field_key=weekday_tinyint,start_time,service_body_bigint,id_bigint,meeting_name,location_text,email_contact&sort_keys=meeting_name,service_body_bigint,weekday_tinyint,start_time");
            $result = json_decode(wp_remote_retrieve_body($results), true);
            $unique_areas = $this->getAreas($root_server, 'dropdown');
            $all_meetings = array();
            foreach ($result as $value) {
                foreach ($unique_areas as $unique_area) {
                    $area_data = explode(',', $unique_area);
                    $area_id = $area_data[1];
                    if ($area_id === $value['service_body_bigint']) {
                        $area_name = $area_data[0];
                    }
                }
                $value['start_time'] = date("g:iA", strtotime($value['start_time']));
                $all_meetings[] = $value['meeting_name'].'||| ['.$value['weekday_tinyint'].'] ['.$value['start_time'].']||| ['.$area_name.']||| ['.$value['id_bigint'].']';
            }
            return $all_meetings;
        }

        public function getCroutonJsConfig($atts)
        {
            // Pulling simple values from options
            $defaults = $this->shortCodeOptions;
            foreach ($defaults as $key => $value) {
                $defaults[$key] = (isset($this->options[$key]) ? $this->options[$key] : $value);
            }
            $params = shortcode_atts($defaults, $atts);

            // Pulling from querystring
            foreach ($params as $key => $value) {
                $params[$key] = (isset($_GET[$key]) ? $_GET[$key] : $value);
            }

            $legacy_force_recurse = false;
            if ($params['service_body_parent'] == null && $params['service_body'] == null) {
                // Pulling from configuration
                $area_data       = explode(',', $this->options['service_body_1']);
                $service_body = [$area_data[1]];
                $parent_body_id  = $area_data[2];
                if ($parent_body_id == '0') {
                    $legacy_force_recurse = true;
                }
            } else {
                // Shortcode based settings
                if ($params['service_body_parent'] != null) {
                    $service_body = array_map('trim', explode(",", $params['service_body_parent']));
                    $legacy_force_recurse = true;
                } elseif ($params['service_body'] != null) {
                    $service_body = array_map('trim', explode(",", $params['service_body']));
                }
            }

            $params['button_filters'] = [];
            if (strlen($params['button_filters_option']) > 0) {
                foreach (explode(",", $params['button_filters_option']) as $item) {
                    $setting = explode(":", $item);
                    if (strcmp($params['include_city_button'], "0") == 0 && strcmp($setting[0], "City") == 0) {
                        continue;
                    }
                    array_push($params['button_filters'], ['title' => $setting[0], 'field' => $setting[1]]);
                }
            }
            $tmp_formats = [];
            if (strlen($params['formats']) > 0) {
                foreach (explode(",", $params['formats']) as $item) {
                    array_push($tmp_formats, $item);
                }
            }
            $params['formats'] = $tmp_formats;

            $tmp_venue = [];
            if (strlen($params['venue_types']) > 0) {
                foreach (explode(",", $params['venue_types']) as $item) {
                    array_push($tmp_venue, $item);
                }
            }
            $params['venue_types'] = $tmp_venue;

            $params['button_format_filters'] = [];
            if (strlen($params['button_format_filters_option']) > 0) {
                foreach (explode(",", $params['button_format_filters_option']) as $item) {
                    $setting = explode(":", $item);
                    array_push($params['button_format_filters'], ['title' => $setting[0], 'field' => $setting[1]]);
                }
            }

            /*$convert_to_int = array("latitude", "longitude", "width", "zoom");
            $params['map_search'] = null;
            foreach (explode(",", $params['map_search_option']) as $item) {
                $setting = explode(":", $item);
                $key = trim($setting[0]);
                $value = trim($setting[1]);
                $params['map_search'][$key] = intval($value);
            }*/

            $params['service_body'] = $service_body;
            $params['exclude_zip_codes'] = (!is_null($params['exclude_zip_codes']) ? explode(",", $params['exclude_zip_codes']) : array());

            if ($legacy_force_recurse) {
                $params['recurse_service_bodies'] = true;
            } elseif (isset($_GET['recurse_service_bodies'])) {
                $params['recurse_service_bodies'] = filter_var($_GET['recurse_service_bodies'], FILTER_VALIDATE_BOOLEAN);
            } elseif (!isset($atts['recurse_service_bodies'])) {
                $params['recurse_service_bodies'] = $this->options['recurse_service_bodies'];
            }

            $params['custom_query'] = $this->getCustomQuery($params['custom_query']);
            $params['template_path'] = plugin_dir_url(__FILE__) . 'croutonjs/dist/templates/';
            $params['theme'] = $params['theme'] != '' ? $params['theme'] : $this->options['theme'];
            $params['custom_css'] = html_entity_decode($this->options['custom_css']);
            $params['int_include_unpublished'] = $params['include_unpublished'];

            if (isset($atts['meeting_data_template']) && $atts['meeting_data_template'] !== null && $atts['meeting_data_template'] !== "") {
                $meeting_data_template = $atts['meeting_data_template'];
            } else {
                $meeting_data_template = $this->options['meeting_data_template'];
            }
            $params['meeting_data_template'] = html_entity_decode($meeting_data_template);

            if (isset($atts['metadata_template']) && $atts['metadata_template'] !== null && $atts['metadata_template'] !== "") {
                $metadata_template = $atts['metadata_template'];
            } else {
                $metadata_template = $this->options['metadata_template'];
            }
            $params['metadata_template'] = html_entity_decode($metadata_template);

            $params['google_api_key'] = $this->options['google_api_key'];
            $extra_meetings_array = [];
            if (isset($this->options['extra_meetings'])) {
                foreach ($this->options['extra_meetings'] as $value) {
                    $data = array(" [", "]");
                    array_push($extra_meetings_array, str_replace($data, "", $value));
                }
            }

            $params['extra_meetings'] = $extra_meetings_array;

            $params['force_rootserver_in_querystring'] = ($params['root_server'] !== $this->options['root_server']);
            // TODO add default language and root_server
            $params = apply_filters('crouton_configuration', $params);
            return json_encode($params);
        }
    }
    //End Class Crouton
}
// end if
// instantiate the class
if (class_exists("Crouton")) {
    $BMLTTabs_instance = new Crouton();
}
?>

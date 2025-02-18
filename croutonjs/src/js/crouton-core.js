var crouton_Handlebars = Handlebars.noConflict();
// These are extension points
crouton_Handlebars.registerHelper("startup", () => '');
crouton_Handlebars.registerHelper("enrich", () => '');
crouton_Handlebars.registerHelper('selectFormatPopup', () => "formatPopup");
crouton_Handlebars.registerHelper('selectObserver', () => "observerTemplate");
function Crouton(config) {
	var self = this;
	self.mutex = false;
	self.map = null;
	self.geocoder = null;
	self.map_objects = [];
	self.map_clusters = [];
	self.oms = null;
	self.markerClusterer = null;
	self.masterFormatCodes = [];
	self.max_filters = 10;  // TODO: needs to be refactored so that dropdowns are treated dynamically
	self.handlebarMapOptions = [];
	self.config = {
		on_complete: null,            // Javascript function to callback when data querying is completed.
		root_server: null,			  // The root server to use.
		placeholder_id: "bmlt-tabs",  // The DOM id that will be used for rendering
		map_max_zoom: 15,		      // Maximum zoom for the display map
		time_format: "h:mm a",        // The format for time
		language: "en-US",            // Default language translation, available translations listed here: https://github.com/bmlt-enabled/crouton/blob/master/croutonjs/src/js/crouton-localization.js
		has_tabs: true,               // Shows the day tabs
		filter_tabs: false,   		  // Whether to show weekday tabs on filtering.
		header: true,                 // Shows the dropdowns and buttons
		include_weekday_button: true, // Shows the weekday button
		int_include_unpublished: 0,	  // Includes unpublished meeting
		button_filters: [
			{'title': 'City', 'field': 'location_municipality'},
		],
		button_format_filters: [],
		default_filter_dropdown: "",  // Sets the default format for the dropdowns, the names will match the `has_` fields dropdowns without `has_.  Example: `formats=closed`.
		show_map: false,              // Shows the map with pins
		map_search: null, 			  // Start search with map click (ex {"latitude":x,"longitude":y,"width":-10,"zoom":10}
		has_days: false,			  // Shows the days of the week dropdown
		has_cities: true,             // Shows the cities dropdown
		has_formats: true,            // Shows the formats dropdown
		has_groups: true,             // Shows the groups dropdown
		has_locations: true,          // Shows the locations dropdown
		has_zip_codes: true,          // Shows the zip codes dropdown
		has_areas: false,             // Shows the areas dropdown
		has_regions: false,			  // Shows the regions dropdown
		has_states: false,            // Shows the states dropdown
		has_sub_province: false,      // Shows the sub province dropdown (counties)
		has_neighborhoods: false,     // Shows the neighborhood dropdown
		has_languages: false,		  // Shows the language dropdown
		has_common_needs: false, 	  // Shows the Common Needs dropdown
		has_venues: true,		      // Shows the venue types dropdown
		has_meeting_count: false,	  // Shows the meeting count
		show_distance: false,         // Determines distance on page load
		distance_search: 0,			  // Makes a distance based search with results either number of / or distance from coordinates
		recurse_service_bodies: false,// Recurses service bodies when making service bodies request
		service_body: [],             // Array of service bodies to return data for.
		formats: '',		  		  // Return only meetings with these formats (format shared-id, not key-string)
		venue_types: '',			  // Return only meetings with this venue type (1, 2 or 3)
		strict_datafields: true,	  // Only get the datafields that are mentioned in the templates
		meeting_details_href: '',	  // Link to the meeting details page
		virtual_meeting_details_href: '', // Link to the virtual meeting details page
		exclude_zip_codes: [],        // List of zip codes to exclude
		extra_meetings: [],           // List of id_bigint of meetings to include
		native_lang: '',				  // The implied language of meetings with no explicit language specied.  May be there as second language, but it still doesn't make sense to search for it.
		auto_tz_adjust: false,        // Will auto adjust the time zone, by default will assume the timezone is local time
		base_tz: null,                // In conjunction with auto_tz_adjust the timezone to base from.  Choices are listed here: https://github.com/bmlt-enabled/crouton/blob/master/croutonjs/src/js/moment-timezone.js#L623
		custom_query: null,			  // Enables overriding the services related queries for a custom one
		google_api_key: null,		  // Required if using the show_map option.  Be sure to add an HTTP restriction as well.
		sort_keys: "start_time",	  // Controls sort keys on the query
		int_start_day_id: 1,          // Controls the first day of the week sequence.  Sunday is 1.
		view_by: "weekday",           // TODO: replace with using the first choice in button_filters as the default view_by.
		show_qrcode: false,  		  // Determines whether or not to show the QR code for virtual / phone meetings if they exist.
		force_rootserver_in_querystring: true, // Set to false to shorten generated meeting detail query strings
		force_timeformat_in_querystring: true, // Set to false to shorten generated meeting detail query strings
		force_language_in_querystring: true, // Set to false to shorten generated meeting detail query strings
		theme: "jack",                // Allows for setting pre-packaged themes.  Choices are listed here:  https://github.com/bmlt-enabled/crouton/blob/master/croutonjs/dist/templates/themes
		meeting_data_template: croutonDefaultTemplates.meeting_data_template,
		metadata_template: croutonDefaultTemplates.metadata_template,
		observer_template: croutonDefaultTemplates.observer_template,
		meeting_count_template: croutonDefaultTemplates.meeting_count_template,
		meeting_link_template: croutonDefaultTemplates.meeting_link_template,
	};

	self.setConfig(config);
	self.loadGapi = function(callbackFunctionName) {
		var tag = document.createElement('script');
		tag.src = "https://maps.googleapis.com/maps/api/js?key=" + self.config['google_api_key'] + "&callback=" + callbackFunctionName;
		tag.defer = true;
		tag.async = true;
		var firstScriptTag = document.getElementsByTagName('script')[0];
		firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
	};
	self.getCurrentLocation = function(callback) {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(callback, self.errorHandler);
		} else {
			$('.geo').removeClass("hide").addClass("show").html('<p>Geolocation is not supported by your browser</p>');
		}
	};

	self.searchByCoordinates = function(latitude, longitude) {
		var width = self.config['map_search']['width'] || -50;

		self.config['custom_query'] = (self.config['custom_query'] !== null ? self.config['custom_query'] : "")
			+ "&lat_val=" + latitude + "&long_val=" + longitude
			+ (self.config['distance_units'] === "km" ? '&geo_width_km=' : '&geo_width=') + width;
		self.meetingSearch()
			.then(function() {
				self.reset();
				self.render();
				self.initMap(function() {
					self.addCurrentLocationPin(latitude, longitude);
				});
			});
	};

	self.addCurrentLocationPin = function(latitude, longitude) {
		var latlng = new google.maps.LatLng(latitude, longitude);
		self.map.setCenter(latlng);

		var currentLocationMarker = new google.maps.Marker({
			"map": self.map,
			"position": latlng,
		});

		self.addToMapObjectCollection(currentLocationMarker);

		// TODO: needs to show on click only
		/*var infowindow = new google.maps.InfoWindow({
			"content": 'Current Location',
			"position": latlng,
		}).open(self.map, currentLocationMarker);*/
	};

	self.findMarkerById = function(id) {
		for (var m = 0; m < self.map_objects.length; m++) {
			var map_object = self.map_objects[m];
			if (parseInt(map_object['id']) === id) {
				return map_object;
			}
		}

		return null;
	};

	self.rowClick = function(id) {
		var map_marker = self.findMarkerById(id);
		if (!map_marker) return;
		self.map.setCenter(map_marker.getPosition());
		self.map.setZoom(17);
		google.maps.event.trigger(map_marker, "click");
	};

	self.addToMapObjectCollection = function(obj) {
		self.map_objects.push(obj);
	};

	self.clearAllMapClusters = function() {
		while (self.map_clusters.length > 0) {
			self.map_clusters[0].setMap(null);
			self.map_clusters.splice(0, 1);
		}

		if (self.oms !== null) {
			self.oms.removeAllMarkers();
		}

		if (self.markerClusterer !== null) {
			self.markerClusterer.clearMarkers();
		}
	};

	self.clearAllMapObjects = function() {
		while (self.map_objects.length > 0) {
			self.map_objects[0].setMap(null);
			self.map_objects.splice(0, 1);
		}

		//infoWindow.close();
	};

	self.getMeetings = function(url) {
		var promises = [fetchJsonp(this.config['root_server'] + url).then(function(response) { return response.json(); })];

		if (self.config['extra_meetings'].length > 0) {
			var extra_meetings_query = "";
			for (var i = 0; i < self.config['extra_meetings'].length; i++) {
				extra_meetings_query += "&meeting_ids[]=" + self.config["extra_meetings"][i];
			}
			const regex = /&services\[\]=\d+/;
			url = url.replace(regex, '');
			promises.push(fetchJsonp(self.config['root_server'] + url + extra_meetings_query).then(function (response) { return response.json(); }));
		}

		return Promise.all(promises)
			.then(function(data) {
				var mainMeetings = data[0];
				var extraMeetings;
				var jsonMeetings = JSON.stringify(mainMeetings['meetings']);
				if (data.length === 2) {
					extraMeetings = data[1];
				}
				if (jsonMeetings === "{}" || jsonMeetings === "[]") {
					var fullUrl = self.config['root_server'] + url
					console.log("Could not find any meetings for the criteria specified with the query <a href=\"" + fullUrl + "\" target=_blank>" + fullUrl + "</a>");
					jQuery('#' + self.config['placeholder_id']).html("No meetings found.");
					self.mutex = false;
					return;
				}
				mainMeetings['meetings'].exclude(self.config['exclude_zip_codes'], "location_postal_code_1");
				self.meetingData = mainMeetings['meetings'];
				self.formatsData = mainMeetings['formats'];

				if (extraMeetings) {
					self.meetingData = self.meetingData.concat(extraMeetings['meetings']);
				}
				self.mutex = false;
			});
	};
	self.addDatafieldsToQuery = function() {
		if (!self.config.strict_datafields) {
			self.all_data_keys = [];
			self.queryable_data_keys = [];
			return '';
		}
		var base_data_field_keys = [
			'location_postal_code_1',
			'duration_time',
			'start_time',
			'time_zone',
			'weekday_tinyint',
			'service_body_bigint',
			'longitude',
			'latitude',
			'location_province',
			'location_municipality',
			'location_street',
			'location_info',
			'location_text',
			'location_neighborhood',
			'formats',
			'format_shared_id_list',
			'comments',
			'meeting_name',
			'location_sub_province',
			'worldid_mixed',
			'root_server_uri',
			'id_bigint',
			'venue_type',
		];

		var calculated_keys = [
			"serviceBodyName",
			"serviceBodyUrl",
			"serviceBodyPhone",
			"serviceBodyDescription",
			"serviceBodyType",
			"parentServiceBodyName",
			"parentServiceBodyUrl",
			"parentServiceBodyPhone",
			"parentServiceBodyDescription",
			"parentServiceBodyType",
			"map_word",
			"share_word",
			"show_qrcode",
			"formatted_day",
			"formatted_address",
			"formats_expanded",
			"formatted_location_info",
			"end_time_formatted",
			"start_time_formatted",
			"formatted_comments",
			"start_time_raw",
			"venue_type_name",
			"day_of_the_week",
		];

		self.all_data_keys = base_data_field_keys.clone();
		self.queryable_data_keys = base_data_field_keys.clone();

		self.collectDataKeys = function(template) {
			var extra_fields_regex = /this\.([A-Za-z0-9_]*)}}/gi;
			while (arr = extra_fields_regex.exec(template)) {
				self.all_data_keys.push(arr[1]);
				if (!inArray(arr[1], calculated_keys)) {
					self.queryable_data_keys.push(arr[1]);
				}
			}
		}

		self.collectDataKeys(self.config['meeting_data_template']);
		self.collectDataKeys(self.config['metadata_template']);
		self.collectDataKeys(self.config['observer_template']);

		var unique_data_field_keys = arrayUnique(self.queryable_data_keys);
		return '&data_field_key=' + unique_data_field_keys.join(',');
	}
	self.mutex = true;

	self.meetingSearch = function() {
		var url = '/client_interface/jsonp/?switcher=GetSearchResults&get_used_formats&lang_enum=' + self.config['short_language'] +
			self.addDatafieldsToQuery();

		if (self.config['formats']) {
			url += self.config['formats'].reduce(function(prev,id) {
				return prev +'&formats[]='+id;
			}, '');
		}
		if (self.config['venue_types']) {
			url += self.config['venue_types'].reduce(function(prev,id) {
				return prev +'&venue_types[]='+id;
			}, '');
		}
		if (self.config['int_include_unpublished'] === 1) {
			url += "&advanced_published=0"
		} else if (self.config['int_include_unpublished'] === -1) {
			url += "&advanced_published=-1"
		}

		if (self.config['distance_search'] !== 0) {
			if (navigator.geolocation) {
				return new Promise(function (resolve, reject) {
					navigator.geolocation.getCurrentPosition(resolve, reject);
				}).then(function(position) {
					url += '&lat_val=' + position.coords.latitude
						+ '&long_val=' + position.coords.longitude
						+ '&sort_results_by_distance=1';

					url += (self.config['distance_units'] === "km" ? '&geo_width_km=' : '&geo_width=') + self.config['distance_search'];
					return self.getMeetings(url);
				});
			}
		} else if (self.config['custom_query'] != null) {
			url += self.config['custom_query'] + '&sort_keys='  + self.config['sort_keys'];
			return self.getMeetings(url);
		} else if (self.config['service_body'].length > 0) {
			for (var i = 0; i < self.config['service_body'].length; i++) {
				url += '&services[]=' + self.config['service_body'][i];
			}

			if (self.config['recurse_service_bodies']) {
				url += '&recursive=1';
			}

			url += '&sort_keys=' + self.config['sort_keys'];

			return self.getMeetings(url);
		} else {
			return new Promise(function(resolve, reject) {
				resolve();
			});
		}
	};

	if (self.config['map_search'] !== null) {
		self.loadGapi('crouton.renderMap');
	} else {
		self.meetingSearch();
	}

	self.lock = function(callback) {
		var self = this;
		var lock_id = setInterval(function() {
			if (!self.mutex) {
				clearInterval(lock_id);
				callback();
			}
		}, 100)
	};

	self.dayTab = function(day_id) {
		self.hideAllPages();
		jQuery('.nav-tabs a[href="#tab' + day_id + '"]').tab('show');
		self.showPage("#" + day_id);
	};

	self.showPage = function (id) {
		jQuery(id).removeClass("hide").addClass("show");
	};

	self.showView = function (viewName) {
		if (viewName === "byday") {
			self.byDayView();
		} else if (viewName === "day" || viewName === "weekday") {
			self.dayView();
		} else if (viewName === "city") {
			self.filteredView("location_municipality");
		} else {
			self.filteredView(viewName);
		}
	};

	self.byDayView = function () {
		self.resetFilter();
		self.lowlightButton(".filterButton");
		self.highlightButton("#day");
		jQuery('.bmlt-page').each(function (index) {
			self.hidePage("#" + this.id);
			self.showPage("#byday");
			self.showPage("#nav-days");
			return;
		});
	};

	self.dayView = function () {
		self.resetFilter();
		self.lowlightButton(".filterButton");
		self.highlightButton("#day");
		jQuery('.bmlt-page').each(function (index) {
			self.hidePage("#" + this.id);
			self.showPage("#days");
			self.showPage("#nav-days");
			self.showPage("#tabs-content");
			return;
		});
	};

	self.filteredView = function (field) {
		self.resetFilter();
		self.lowlightButton("#day");
		self.lowlightButton(".filterButton");
		self.highlightButton("#filterButton_" + field);
		jQuery('.bmlt-page').each(function (index) {
			self.hidePage("#" + this.id);
			self.showPage("#byfield_" + field);
			return;
		});
	};

	self.lowlightButton = function (id) {
		jQuery(id).removeClass("buttonHighlight").addClass("buttonLowlight");
	};

	self.highlightButton = function (id) {
		jQuery(id).removeClass("buttonLowlight").addClass("buttonHighlight");
	};

	self.hidePage = function (id) {
		jQuery(id).removeClass("show").addClass("hide");
	};

	self.hideAllPages = function (id) {
		jQuery("#tab-pane").removeClass("show").addClass("hide");
	};

	self.filteredPage = function (dataType, dataValue) {
		jQuery(".meeting-header").removeClass("hide");
		jQuery(".bmlt-data-row").removeClass("hide");
		if (dataType !== "formats" && dataType !== "languages" && dataType !== "venues" && dataType !== "common_needs") {
			jQuery(".bmlt-data-row").not("[data-" + dataType + "='" + dataValue + "']").addClass("hide");
		} else {
			jQuery(".bmlt-data-row").not("[data-" + dataType + "~='" + dataValue + "']").addClass("hide");
		}
		jQuery(".bmlt-data-row").not(".hide").each(function (index, value) {
			jQuery(value).addClass((index % 2) ? 'oddRow' : 'evenRow');
		});
		if (self.config['filter_tabs']) {
			self.showPage("#nav-days");
			self.showPage("#tabs-content");
		} else {
			self.lowlightButton(".filterButton");
			self.lowlightButton("#day");
			self.showPage("#byday");

			jQuery(".bmlt-data-rows").each(function (index, value) {
				if (jQuery(value).find(".bmlt-data-row.hide").length === jQuery(value).find(".bmlt-data-row").length) {
					jQuery(value).find(".meeting-header").addClass("hide");
				}
			});
		}
	};

	self.resetFilter = function () {
		jQuery(".filter-dropdown").val(null).trigger("change");
		jQuery(".meeting-header").removeClass("hide");
		jQuery(".bmlt-data-row").removeClass("hide");
		jQuery(".evenRow").removeClass("evenRow");
		jQuery(".oddRow").removeClass("oddRow");
	};

	self.renderView = function (selector, context, callback) {
		hbs_Crouton['localization'] = self.localization;
		crouton_Handlebars.registerPartial('meetings', hbs_Crouton.templates['meetings']);
		crouton_Handlebars.registerPartial('bydays', hbs_Crouton.templates['byday']);
		crouton_Handlebars.registerPartial('weekdays', hbs_Crouton.templates['weekdays']);
		crouton_Handlebars.registerPartial('header', hbs_Crouton.templates['header']);
		crouton_Handlebars.registerPartial('byfields', hbs_Crouton.templates['byfield']);
		crouton_Handlebars.registerPartial('formatPopup', hbs_Crouton.templates['formatPopup']);
		var template = hbs_Crouton.templates['main'];
		jQuery(selector).html(template(context));
		callback();
	};

	self.getServiceBodies = function(service_bodies_id) {
		var requires_parents = false;
		for (var i = 0; i < self.all_data_keys.length; i++) {
			var data_key = self.all_data_keys[i];
			if (data_key.indexOf("parentServiceBody") >= 0 || self.config.has_regions) {
				requires_parents = true;
				break;
			}
		}

		var url = this.config['root_server'] + '/client_interface/jsonp/?switcher=GetServiceBodies'
			+ (requires_parents ? '&parents=1' : '') + getServiceBodiesQueryString(service_bodies_id);
		return fetchJsonp(url)
			.then(function(response) {
				return response.json();
			});
	};

	self.getMasterFormats = function() {
		var url = this.config['root_server'] + '/client_interface/jsonp/?switcher=GetFormats&lang_enum=en&key_strings[]=TC&key_strings[]=VM&key_strings[]=HY';
		return fetchJsonp(url)
			.then(function(response) {
				return response.json();
			});
	}

	self.showLocation = function(position) {
		var latitude = position.coords.latitude;
		var longitude = position.coords.longitude;
		var distanceUnit;
		var distanceCalculation;

		if (self.config['distance_units'] === "km") {
			distanceUnit = "km";
			distanceCalculation = "K";
		} else if (self.config['distance_units'] === "nm") {
			distanceUnit = "nm";
			distanceCalculation = "N";
		} else {
			distanceUnit = "mi";
			distanceCalculation = "M";
		}

		jQuery( ".geo" ).each(function() {
			var target = jQuery( this ).html();
			var arr = target.split(',');
			var distance_result = self.distance(latitude, longitude, arr[0], arr[1], distanceCalculation);
			jQuery( this ).removeClass("hide").addClass("show").html(distance_result.toFixed(1) + ' ' + distanceUnit);
		});
	};

	self.errorHandler = function(msg) {
		jQuery('.geo').removeClass("hide").addClass("show").html('');
	};

	self.distance = function(lat1, lon1, lat2, lon2, unit) {
		if ((lat1 === lat2) && (lon1 === lon2)) {
			return 0;
		} else {
			var radlat1 = Math.PI * lat1/180;
			var radlat2 = Math.PI * lat2/180;
			var theta = lon1-lon2;
			var radtheta = Math.PI * theta/180;
			var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
			if (dist > 1) {
				dist = 1;
			}
			dist = Math.acos(dist);
			dist = dist * 180/Math.PI;
			dist = dist * 60 * 1.1515;
			if (unit === "K") {
				return dist * 1.609344;
			} else if (unit === "N") {
				return dist * 0.8684;
			} else {
				return dist;
			}
		}
	};
	self.toFarsinNumber = function( n ) {
		const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
		
		return n.replace(/\d/g, x => farsiDigits[x]);
	}
	self.enrichMeetings = function (meetingData, filter) {
		var meetings = [];

		crouton_Handlebars.registerPartial("meetingDataTemplate", self.config['meeting_data_template']);
		crouton_Handlebars.registerPartial("metaDataTemplate", self.config['metadata_template']);
		crouton_Handlebars.registerPartial("observerTemplate", self.config['observer_template']);
		crouton_Handlebars.registerPartial("meetingCountTemplate", self.config['meeting_count_template']);
		crouton_Handlebars.registerPartial("meetingLink", self.config['meeting_link_template']);

		for (var m = 0; m < meetingData.length; m++) {
			meetingData[m]['formatted_comments'] = meetingData[m]['comments'];
			var duration = meetingData[m]['duration_time'].split(":");
			// convert from bmlt day to iso day
			meetingData[m]['start_time_raw'] = this.getAdjustedDateTime(
				parseInt(meetingData[m]['weekday_tinyint']) === 1 ? 7 : parseInt(meetingData[m]['weekday_tinyint']) - 1,
				meetingData[m]['start_time'],
				meetingData[m]['time_zone']
			);
			meetingData[m]['start_time_formatted'] = meetingData[m]['start_time_raw'].format(self.config['time_format']);
			meetingData[m]['end_time_formatted'] = meetingData[m]['start_time_raw']
				.clone()
				.add(duration[0], 'hours')
				.add(duration[1], 'minutes')
				.format(self.config['time_format']);
			if (self.config.language === 'fa-IR') {
				meetingData[m]['start_time_formatted'] = self.toFarsinNumber(meetingData[m]['start_time_formatted']);
				meetingData[m]['end_time_formatted'] = self.toFarsinNumber(meetingData[m]['end_time_formatted']);				
			}

			// back to bmlt day
			meetingData[m]['day_of_the_week'] = meetingData[m]['start_time_raw'].isoWeekday() === 7 ? 1 : meetingData[m]['start_time_raw'].isoWeekday() + 1;
			meetingData[m]['formatted_day'] = self.localization.getDayOfTheWeekWord(meetingData[m]['day_of_the_week']);

			var formats = meetingData[m]['formats'].split(",");
			var formats_expanded = [];
			for (var f = 0; f < formats.length; f++) {
				for (var g = 0; g < self.formatsData.length; g++) {
					if (formats[f] === self.formatsData[g]['key_string']) {
						formats_expanded.push(
							{
								"id": self.formatsData[g]['id'],
								"key": formats[f],
								"name": self.formatsData[g]['name_string'],
								"description": self.formatsData[g]['description_string'],
								"type": self.formatsData[g]['format_type_enum'],
							}
						)
					}
				}
			}

			meetingData[m]['venue_type'] = parseInt(meetingData[m]['venue_type']);
			meetingData[m]['venue_type_name'] = getVenueTypeName(meetingData[m]);
			meetingData[m]['formats_expanded'] = formats_expanded;
			var addressParts = [
				meetingData[m]['location_street'],
				meetingData[m]['location_municipality'].trim(),
				meetingData[m]['location_province'].trim(),
				meetingData[m]['location_postal_code_1'].trim()
			];
			addressParts.clean();
			meetingData[m]['formatted_address'] = addressParts.join(", ");
			meetingData[m]['formatted_location_info'] =
				meetingData[m]['location_info'] != null
					? meetingData[m]['location_info'].replace('/(http|https):\/\/([A-Za-z0-9\._\-\/\?=&;%,]+)/i', '<a style="text-decoration: underline;" href="$1://$2" target="_blank">$1://$2</a>')
					: "";
			meetingData[m]['map_word'] = self.localization.getWord('map').toUpperCase();
			meetingData[m]['share_word'] = self.localization.getWord('share').toUpperCase();
			meetingData[m]['show_qrcode'] = self.config['show_qrcode'];
			for (var k in meetingData[m]) {
				if (meetingData[m].hasOwnProperty(k) && typeof meetingData[m][k] === 'string') {
					if (meetingData[m][k].indexOf('#@-@#') !== -1) {
						var split = meetingData[m][k].split('#@-@#');
						meetingData[m][k] = split[split.length - 1];
					}
				}
			}

			var serviceBodyInfo = self.getServiceBodyDetails(meetingData[m]['service_body_bigint'])
			meetingData[m]['serviceBodyUrl'] = serviceBodyInfo["url"];
			meetingData[m]['serviceBodyPhone'] = serviceBodyInfo["helpline"];
			meetingData[m]['serviceBodyName'] = serviceBodyInfo["name"];
			meetingData[m]['serviceBodyDescription'] = serviceBodyInfo["description"];
			meetingData[m]['serviceBodyContactEmail'] = serviceBodyInfo["contact_email"];
			meetingData[m]['serviceBodyType'] = self.localization.getServiceBodyType(serviceBodyInfo["type"]);

			var parentBodyInfo = self.getServiceBodyDetails(serviceBodyInfo["parent_id"]);
			if (parentBodyInfo !== undefined) {
				meetingData[m]['parentServiceBodyUrl'] = parentBodyInfo["url"];
				meetingData[m]['parentServiceBodyPhone'] = parentBodyInfo["helpline"];
				meetingData[m]['parentServiceBodyName'] = parentBodyInfo["name"];
				meetingData[m]['parentServiceBodyDescription'] = parentBodyInfo["description"];
				meetingData[m]['parentServiceBodyType'] = self.localization.getServiceBodyType(parentBodyInfo["type"]);
			}

			meetingData[m]['meeting_details_url'] = '';
			if (self.config.meeting_details_href) {
				meetingData[m]['meeting_details_url'] = self.config.meeting_details_href;
				if (meetingData[m]['venue_type'] === 2 && self.config.virtual_meeting_details_href ) {
					meetingData[m]['meeting_details_url'] = self.config.virtual_meeting_details_href;
				}
				meetingData[m]['meeting_details_url'] += ('?meeting-id=' + meetingData[m]['id_bigint']
													   + '&language=' + self.config.language
													   + '&time_format=' + encodeURIComponent(self.config.time_format) 
													   + (self.config.force_rootserver_in_querystring ? '&root_server=' + encodeURIComponent(self.config.root_server) : '')
													); 
			}

			meetings.push(meetingData[m])
		}

		return meetings;
	};

	self.showMessage = function(message) {
		jQuery("#" + self.config['placeholder_id']).html("crouton: " + message);
		jQuery("#" + self.config['placeholder_id']).removeClass("hide");
	};

	self.isEmpty = function(obj) {
		for (var key in obj) {
			if(obj.hasOwnProperty(key))
				return false;
		}
		return true;
	};
}

Crouton.prototype.setConfig = function(config) {
	var self = this;
	for (var propertyName in config) {
		if (propertyName.indexOf("_template") > 0 && config[propertyName].trim() === "") {
			continue;
		} else if (propertyName.indexOf("int_") === -1) {
			if (config[propertyName] === "1" || config[propertyName] === 1) {
				self.config[propertyName] = true;
			} else if (config[propertyName] === "0" || config[propertyName] === 0) {
				self.config[propertyName] = false;
			} else {
				self.config[propertyName] = config[propertyName];
			}
		} else {
			self.config[propertyName] = parseInt(config[propertyName] || 0);
		}
	}

	self.config["distance_search"] = parseInt(self.config["distance_search"] || 0);
	self.config["day_sequence"] = [];
	self.config.day_sequence.push(self.config.int_start_day_id);
	for (var i = 1; i < 7; i++) {
		var next_day = self.config.day_sequence[i - 1] + 1;
		if (next_day > 7) {
			self.config.day_sequence.push(next_day - 7);
		} else {
			self.config.day_sequence.push(next_day);
		}
	}

	if (self.config["view_by"] === "weekday") {
		self.config["include_weekday_button"] = true;
	}

	if (!self.config["has_tabs"]) {
		self.config["view_by"] = "byday";
	}

	if (self.config["template_path"] == null) {
		self.config["template_path"] = "templates"
	}

	// https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
	// We hardcode override Dansk because of a legacy issue in the root server that doesn't follow ISO 639 standards.
	self.config['short_language'] = self.config['language'] === "da-DK" ? "dk" : self.config['language'].substring(0, 2);
	self.localization = new CroutonLocalization(self.config['language']);
};

Crouton.prototype.reset = function() {
	var self = this;
	jQuery("#custom-css").remove();
	jQuery("#" + self.config["placeholder_id"]).html("");
	self.clearAllMapObjects();
	self.clearAllMapClusters();
};

Crouton.prototype.meetingCount = function(callback) {
	var self = this;
	self.lock(function() {
		callback(self.meetingData.length);
	});
};

Crouton.prototype.groupCount = function(callback) {
	var self = this;
	self.lock(function() {
		var groups = [];
		for (var i = 0; i < self.meetingData.length; i++) {
			groups.push(self.meetingData[i]['worldid_mixed'] !== "" ? self.meetingData[i]['worldid_mixed'] : self.meetingData[i]['meeting_name']);
		}
		callback(arrayUnique(groups).length);
	});
};

Crouton.prototype.serviceBodyNames = function(callback) {
	var self = this;
	self.lock(function() {
		var ids = getUniqueValuesOfKey(self.meetingData, 'service_body_bigint');
		self.getServiceBodies(ids).then(function (service_bodies) {
			var n = service_bodies.length;
			var names = [];
			for (var i = 0; i < n; i++) {
				names.push(service_bodies[i]['name']);
			}
			names.sort();
			if (n===1) {
				callback(names[0]);
			}
			else if (n===2) {
				callback(names[0] + ' and ' + names[1]);
			}
			else {
				var str = '';
				for (var j = 0; j < n-1; j++) {
					str += names[j];
					str += ', ';
				}
				callback(str + ' and ' + names[n-1]);
			}
		});
	});
};

Crouton.prototype.getServiceBodyDetails = function(serviceBodyId) {
	var self = this;
	for (var s = 0; s < self.all_service_bodies.length; s++) {
		var service_body = self.all_service_bodies[s];
		if (service_body['id'] === serviceBodyId) {
			return service_body;
		}
	}
}

Crouton.prototype.doHandlebars = function() {
	var elements = document.getElementsByTagName('bmlt-handlebar');
	if (elements.length === 0) {
		console.log('No <bmlt-handlebar> tags found');
		return;
	};
	var self = this;
	self.lock(function() {
		if (self.isEmpty(self.meetingData)) {
			for (let i = 0; i < elements.length; i++) {
				var element = elements.item(i);
				element.innerHTML = "Meeting not found!";
			}
			return;
		}
		var promises = [self.getServiceBodies([self.meetingData[0]['service_body_bigint']])];
		Promise.all(promises)
			.then(function(data) {
				hbs_Crouton['localization'] = self.localization;
				self.active_service_bodies = [];
				self.all_service_bodies = [];
				var service_body = data[0][0];
				self.all_service_bodies.push(service_body);
				var enrichedMeetingData = self.enrichMeetings(self.meetingData);
				var customStartupTemplate = crouton_Handlebars.compile('{{startup}}');
				customStartupTemplate(enrichedMeetingData);
				var customEnrichTemplate = crouton_Handlebars.compile('{{enrich this}}');
				customEnrichTemplate(enrichedMeetingData[0]);
				var mustDoMap = false;
				crouton_Handlebars.registerHelper('crouton_map', function(options) {
					mustDoMap = true;
					self.handlebarMapOptions = options.hash;
					if (!self.handlebarMapOptions.zoom) self.handlebarMapOptions.zoom = 14;
					self.handlebarMapOptions.lat = parseFloat(enrichedMeetingData[0].latitude);
					self.handlebarMapOptions.lng = parseFloat(enrichedMeetingData[0].longitude);
					return "<div id='bmlt-map' class='bmlt-map'></div>"
				});
				var parser = new DOMParser();

				while (elements.length > 0) {
					var element = elements.item(0);
					if (!element.firstChild) {
						console.log('<bmlt-handlebar> tag must have at least one child');
						element.remove();
						continue;
					}
					var templateString = '';
					if (element.firstChild.nodeType === 1) {
						if (!element.firstChild.firstChild || element.firstChild.firstChild.nodeType !== 3) {
							console.log('<bmlt-handlebar> tag: cannot find textnode');
							element.remove();
							continue;
						}
						templateString = element.firstChild.firstChild.textContent;
					} else if (element.firstChild.nodeType === 3) {
						if (!element.firstChild.nodeType !== 3) {
							console.log('<bmlt-handlebar> tag: cannot find textnode');
							element.remove();
							continue;
						}
						templateString = element.firstChild.textContent;
					}
					var handlebarResult;
					try { 
						var template = crouton_Handlebars.compile(templateString);
						handlebarResult = template(enrichedMeetingData[0]);
					} catch (e) {
						console.log(e);
						handlebarResult = e.message;
					}
					var htmlDecode = parser.parseFromString('<body>'+handlebarResult+'</body>', "text/html");
					if (!htmlDecode.body || !htmlDecode.body.firstChild) {
						console.log('<bmlt-handlebar> tag: could not parse the Handlebars result');
						element.replaceWith('<bmlt-handlebar> tag: could not parse the Handlebars result');
						continue;
					}
					var firstPart = htmlDecode.body.firstChild;
					var brothers = [];
					var thisPart = firstPart;
					var nextPart = null;
					while (nextPart = thisPart.nextSibling) {
						thisPart = nextPart;
						brothers.push(thisPart);
					}
					element.replaceWith(firstPart);
					if (brothers) firstPart.after(...brothers);
				}
				if (mustDoMap) {
					self.meetingData = enrichedMeetingData;
					self.loadGapi('crouton.initMap');
				}
			});
	});

};

Crouton.prototype.render = function() {
	var self = this;
	self.lock(function() {
		var body = jQuery("body");
		if (self.config['theme'] !== '') {
			body.append("<div id='custom-css'><link rel='stylesheet' type='text/css' href='" + self.config['template_path'] + '/themes/' + self.config['theme'] + ".css'>");
		}

		body.append("<div id='custom-css'><style type='text/css'>" + self.config['custom_css'] + "</style></div>");

		if (self.isEmpty(self.meetingData)) {
			self.showMessage("No meetings found for parameters specified.");
			return;
		}

		var unique_service_bodies_ids = getUniqueValuesOfKey(self.meetingData, 'service_body_bigint').sort();
		var promises = [self.getMasterFormats(), self.getServiceBodies(unique_service_bodies_ids)];

		self.uniqueData = {
			'groups': getUniqueValuesOfKey(self.meetingData, 'meeting_name').sort(),
			'cities': getUniqueValuesOfKey(self.meetingData, 'location_municipality').sort(),
			'locations': getUniqueValuesOfKey(self.meetingData, 'location_text').sort(),
			'sub_provinces': getUniqueValuesOfKey(self.meetingData, 'location_sub_province').sort(),
			'neighborhoods': getUniqueValuesOfKey(self.meetingData, 'location_neighborhood').sort(),
			'states': getUniqueValuesOfKey(self.meetingData, 'location_province').sort(),
			'zips': getUniqueValuesOfKey(self.meetingData, 'location_postal_code_1').sort(),
			'unique_service_bodies_ids': unique_service_bodies_ids,
			'venue_types': getValuesFromObject(crouton.localization.getWord("venue_type_choices")).sort()
		};

		Promise.all(promises)
			.then(function(data) {
				self.active_service_bodies = [];
				self.all_service_bodies = [];
				self.masterFormatCodes = data[0];
				var service_bodies = data[1];
				for (var i = 0; i < service_bodies.length; i++) {
					self.all_service_bodies.push(service_bodies[i]);
					for (var j = 0; j < self.uniqueData['unique_service_bodies_ids'].length; j++) {
						if (service_bodies[i]["id"] === self.uniqueData['unique_service_bodies_ids'][j]) {
							self.active_service_bodies.push(service_bodies[i]);
						}
					}
				}

				self.uniqueData['regions'] = [];
				for (var i = 0; i < self.all_service_bodies.length; i++) {
					var service_body = self.all_service_bodies[i];
					if (service_body.type === 'RS') {
						self.uniqueData['regions'].push(service_body)
					}
				}

				self.uniqueData['areas'] = self.active_service_bodies.sortByKey('name');
				if (!jQuery.isEmptyObject(self.formatsData)) {
					self.formatsData = self.formatsData.sortByKey('name_string');
				}
				self.uniqueData['formats'] = self.formatsData;
				self.uniqueData['languages'] = [];
				self.uniqueData['common_needs'] = [];

				for (var l = 0; l < self.formatsData.length; l++) {
					var format = self.formatsData[l];
					if (format['format_type_enum'] === "LANG") {
						if (self.config.native_lang !== format.key_string) {
							self.uniqueData['languages'].push(format);
						}
					}
					if (format['format_type_enum'] === "FC3") {
						self.uniqueData['common_needs'].push(format);
					}
				}

				var weekdaysData = [];
				var enrichedMeetingData = self.enrichMeetings(self.meetingData);


				var dayNamesSequenced = [];
				for (var x = 0; x < crouton.config.day_sequence.length; x++) {
					dayNamesSequenced.push(crouton.localization.getDayOfTheWeekWord(crouton.config.day_sequence[x]))
				}
				self.uniqueData['formatted_days'] = sortListByList(getUniqueValuesOfKey(enrichedMeetingData, "formatted_day"), dayNamesSequenced);

				enrichedMeetingData.sort(function (a, b) {
					if (a['start_time_raw'] < b['start_time_raw']) {
						return -1;
					}

					if (a['start_time_raw'] > b['start_time_raw']) {
						return 1;
					}

					return 0;
				});

				var day_counter = 0;
				var byDayData = [];
				var buttonFiltersData = {};
				var buttonFormatFiltersData = {};
				while (day_counter < 7) {
					var day = self.config.day_sequence[day_counter];
					var daysOfTheWeekMeetings = enrichedMeetingData.filterByObjectKeyValue('day_of_the_week', day);
					weekdaysData.push({
						"day": day,
						"meetings": daysOfTheWeekMeetings
					});

					byDayData.push({
						"hide": self.config["hide_byday_headers"],
						"day": self.localization.getDayOfTheWeekWord(day),
						"meetings": daysOfTheWeekMeetings
					});

					for (var f = 0; f < self.config.button_filters.length; f++) {
						var groupByName = self.config.button_filters[f]['field'];
						var groupByData = getUniqueValuesOfKey(daysOfTheWeekMeetings, groupByName).sort();
						for (var i = 0; i < groupByData.length; i++) {
							var groupByMeetings = daysOfTheWeekMeetings.filterByObjectKeyValue(groupByName, groupByData[i]);
							if (buttonFiltersData.hasOwnProperty(groupByName) && buttonFiltersData[groupByName].hasOwnProperty(groupByData[i])) {
								buttonFiltersData[groupByName][groupByData[i]] = buttonFiltersData[groupByName][groupByData[i]].concat(groupByMeetings);
							} else if (buttonFiltersData.hasOwnProperty(groupByName)) {
								buttonFiltersData[groupByName][groupByData[i]] = groupByMeetings;
							} else {
								buttonFiltersData[groupByName] = {};
								buttonFiltersData[groupByName][groupByData[i]] = groupByMeetings;
							}

						}
					}

					for (var f = 0; f < self.config.button_format_filters.length; f++) {
						var groupByName = self.config.button_format_filters[f]['field'];
						var groupByData = getUniqueFormatsOfType(daysOfTheWeekMeetings, groupByName);
						if (groupByName=='LANG' && self.config.native_lang && self.config.native_lang.length > 0) {
							groupByData = groupByData.filter((f) => f.key != self.config.native_lang);
						}
						for (var i = 0; i < groupByData.length; i++) {
							var groupByMeetings = daysOfTheWeekMeetings.filter((item) => item.formats_expanded.map(f => f.key).indexOf(groupByData[i].key) >= 0);
							if (buttonFormatFiltersData.hasOwnProperty(groupByName) && buttonFormatFiltersData[groupByName].hasOwnProperty(groupByData[i].description)) {
								buttonFormatFiltersData[groupByName][groupByData[i].description] = buttonFormatFiltersData[groupByName][groupByData[i].description].concat(groupByMeetings);
							} else if (buttonFormatFiltersData.hasOwnProperty(groupByName)) {
								buttonFormatFiltersData[groupByName][groupByData[i].description] = groupByMeetings;
							} else {
								buttonFormatFiltersData[groupByName] = {};
								buttonFormatFiltersData[groupByName][groupByData[i].description] = groupByMeetings;
							}
						}
					}
					day_counter++;
				}

				var buttonFiltersDataSorted = {};
				for (var b = 0; b < self.config.button_filters.length; b++) {
					var sortKey = [];
					var groupByName = self.config.button_filters[b]['field'];
					for (var buttonFiltersDataItem in buttonFiltersData[groupByName]) {
						sortKey.push(buttonFiltersDataItem);
					}

					sortKey.sort();

					buttonFiltersDataSorted[groupByName] = {};
					for (var s = 0; s < sortKey.length; s++) {
						buttonFiltersDataSorted[groupByName][sortKey[s]] = buttonFiltersData[groupByName][sortKey[s]]
					}
				}

				self.renderView("#" + self.config['placeholder_id'], {
					"config": self.config,
					"meetings": {
						"weekdays": weekdaysData,
						"buttonFilters": buttonFiltersDataSorted,
						"buttonFormatFilters": buttonFormatFiltersData,
						"bydays": byDayData,
						"meetingCount": self.meetingData.length
					},
					"uniqueData": self.uniqueData
				}, function () {
					if (self.config['map_search'] != null || self.config['show_map']) {
						jQuery(".bmlt-data-row").css({cursor: "pointer"});
						jQuery(".bmlt-data-row").click(function () {
							self.rowClick(parseInt(this.id.replace("meeting-data-row-", "")));
						});
					}

					jQuery("#" + self.config['placeholder_id']).addClass("bootstrap-bmlt");
					jQuery(".crouton-select").select2({
						dropdownAutoWidth: true,
						allowClear: false,
						width: "resolve",
						minimumResultsForSearch: 1,
						dropdownCssClass: 'bmlt-drop'
					});

					jQuery('[data-toggle="popover"]').popover().click(function(e) {e.preventDefault(); e.stopPropagation()});
					jQuery('html').on('click', function (e) {
						if (jQuery(e.target).data('toggle') !== 'popover') {
							jQuery('[data-toggle="popover"]').popover('hide');
						}
					});

					jQuery('.filter-dropdown').on('select2:select', function (e) {
						jQuery(this).parent().siblings().children(".filter-dropdown").val(null).trigger('change');

						var val = jQuery(this).val();
						jQuery('.bmlt-page').each(function () {
							self.hidePage(this);
							self.filteredPage(e.target.getAttribute("data-pointer").toLowerCase(), val.replace("a-", ""));
							return;
						});
					});

					jQuery("#day").on('click', function () {
						self.showView(self.config['view_by'] === 'byday' ? 'byday' : 'day');
					});

					jQuery(".filterButton").on('click', function (e) {
						self.filteredView(e.target.attributes['data-field'].value);
					});

					jQuery('.custom-ul').on('click', 'a', function (event) {
						jQuery('.bmlt-page').each(function (index) {
							self.hidePage("#" + this.id);
							self.showPage("#" + event.target.id);
							return;
						});
					});

					if (self.config['has_tabs']) {
						jQuery('.nav-tabs a').on('click', function (e) {
							e.preventDefault();
							jQuery(this).tab('show');
						});

						var d = new Date();
						var n = d.getDay();
						n++;
						jQuery('.nav-tabs a[href="#tab' + n + '"]').tab('show');
						jQuery('#tab' + n).show();
					}

					self.showPage(".bmlt-header");
					self.showPage(".bmlt-tabs");
					self.showView(self.config['view_by']);

					if (self.config['default_filter_dropdown'] !== "") {
						var filter = self.config['default_filter_dropdown'].toLowerCase().split("=");
						jQuery("#filter-dropdown-" + filter[0]).val('a-' + filter[1]).trigger('change').trigger('select2:select');
					}

					if (self.config['show_distance']) {
						self.getCurrentLocation(self.showLocation);
					}

					if (self.config['show_map']) {
						self.loadGapi('crouton.initMap');
					}

					if (self.config['on_complete'] != null && isFunction(self.config['on_complete'])) {
						self.config['on_complete']();
					}
				});
			});
		});
};

Crouton.prototype.mapSearchClickMode = function() {
	var self = this;
	self.mapClickSearchMode = true;
	self.map.setOptions({
		draggableCursor: 'crosshair',
		zoomControl: false,
		gestureHandling: 'none'
	});
};

Crouton.prototype.mapSearchPanZoomMode = function() {
	var self = this;
	self.mapClickSearchMode = false;
	self.map.setOptions({
		draggableCursor: 'default',
		zoomControl: true,
		gestureHandling: 'auto'
	});
};

Crouton.prototype.mapSearchNearMeMode = function() {
	var self = this;
	self.mapSearchPanZoomMode();
	self.getCurrentLocation(function(position) {
		self.searchByCoordinates(position.coords.latitude, position.coords.longitude);
	});
};

Crouton.prototype.mapSearchTextMode = function(location) {
	var self = this;
	self.mapSearchPanZoomMode();
	if (location !== undefined && location !== null && location !== "") {
		self.geocoder.geocode({'address': location}, function (results, status) {
			if (status === 'OK') {
				self.searchByCoordinates(results[0].geometry.location.lat(), results[0].geometry.location.lng());
			} else {
				console.log('Geocode was not successful for the following reason: ' + status);
			}
		});
	}
};

Crouton.prototype.renderMap = function() {
	var self = this;
	jQuery("#bmlt-tabs").before("<div id='bmlt-map' class='bmlt-map'></div>");
	self.geocoder = new google.maps.Geocoder();
	jQuery.when(jQuery.getJSON(self.config['template_path'] + "/themes/" + self.config['theme'] + ".json").then(
		function (data, textStatus, jqXHR) {
			return self.config["theme_js"] = data["google_map_theme"];
		}
	)).then(function() {
		self.map = new google.maps.Map(document.getElementById('bmlt-map'), {
			zoom: self.config['map_search']['zoom'] || 10,
			center: {
				lat: self.config['map_search']['latitude'],
				lng: self.config['map_search']['longitude'],
			},
			mapTypeControl: false,
			styles: self.config["theme_js"]
		});

		var controlDiv = document.createElement('div');

		// Set CSS for the control border
		var controlUI = document.createElement('div');
		controlUI.className = 'mapcontrolcontainer';
		controlUI.title = 'Click to recenter the map';
		controlDiv.appendChild(controlUI);

		// Set CSS for the control interior
		var clickSearch = document.createElement('div');
		clickSearch.className = 'mapcontrols';
		clickSearch.innerHTML = '<label for="nearme" class="mapcontrolslabel"><input type="radio" id="nearme" name="mapcontrols"> ' + self.localization.getWord('near_me') + '</label><label for="textsearch" class="mapcontrolslabel"><input type="radio" id="textsearch" name="mapcontrols"> ' + self.localization.getWord('text_search') + '</label><label for="clicksearch" class="mapcontrolslabel"><input type="radio" id="clicksearch" name="mapcontrols"> ' + self.localization.getWord('click_search') + '</label>';
		controlUI.appendChild(clickSearch);
		controlDiv.index = 1;

		google.maps.event.addDomListener(clickSearch, 'click', function () {
			var controlsButtonSelections = jQuery("input:radio[name='mapcontrols']:checked").attr("id");
			if (controlsButtonSelections === "textsearch") {
				self.mapSearchTextMode(prompt("Enter a location or postal code:"));
			} else if (controlsButtonSelections === "nearme") {
				self.mapSearchNearMeMode();
			} else if (controlsButtonSelections === "clicksearch") {
				self.mapSearchClickMode();
			}
		});

		self.map.controls[google.maps.ControlPosition.TOP_LEFT].push(controlDiv);
		self.map.addListener('click', function (data) {
			if (self.mapClickSearchMode) {
				self.mapSearchPanZoomMode();
				self.searchByCoordinates(data.latLng.lat(), data.latLng.lng());
			}
		});

		if (self.config['map_search']['auto']) {
			self.mapSearchNearMeMode();
		} else if (self.config['map_search']['location'] !== undefined) {
			self.mapSearchTextMode(self.config['map_search']['location']);
		} else if (self.config['map_search']['coordinates_search']) {
			self.searchByCoordinates(self.config['map_search']['latitude'], self.config['map_search']['longitude']);
		}
	})
};
Crouton.prototype.initMap = function(callback) {
	var self = this;
	if (self.map == null) {
		jQuery("#bmlt-tabs").before("<div id='bmlt-map' class='bmlt-map'></div>");
		var mapOpt = { zoom: 3 };
		if (self.handlebarMapOptions.length > 0) mapOpt = {
			center: new google.maps.LatLng(self.handlebarMapOptions.lat, self.handlebarMapOptions.lng),
			zoom: self.handlebarMapOptions.zoom,
			mapTypeId:google.maps.MapTypeId.ROADMAP
		};
		self.map = new google.maps.Map(document.getElementById('bmlt-map'), mapOpt );
	}

 	jQuery("#bmlt-map").removeClass("hide");
	var bounds = new google.maps.LatLngBounds();
	// We go through all the results, and get the "spread" from them.
	for (var c = 0; c < self.meetingData.length; c++) {
		if (self.meetingData[c].venue_type == venueType.VIRTUAL) continue;
		var lat = self.meetingData[c].latitude;
		var lng = self.meetingData[c].longitude;
		// We will set our minimum and maximum bounds.
		bounds.extend(new google.maps.LatLng(lat, lng));
	}
	// We now have the full rectangle of our meeting search results. Scale the map to fit them.
	self.map.fitBounds(bounds);
	var infoWindow = new google.maps.InfoWindow();

	// Create OverlappingMarkerSpiderfier instance
	self.oms = new OverlappingMarkerSpiderfier(self.map, {
		markersWontMove: true,
		markersWontHide: true,
	});

	self.oms.addListener('format', function (marker, status) {
		var iconURL;
		if (status === OverlappingMarkerSpiderfier.markerStatus.SPIDERFIED
			|| status === OverlappingMarkerSpiderfier.markerStatus.SPIDERFIABLE
			|| status === OverlappingMarkerSpiderfier.markerStatus.UNSPIDERFIED) {
			iconURL = self.config['template_path'] + '/NAMarkerR.png';
		} else if (status === OverlappingMarkerSpiderfier.markerStatus.UNSPIDERFIABLE) {
			iconURL = self.config['template_path'] + '/NAMarkerB.png';
		} else {
			iconURL = null;
		}

		var iconSize = new google.maps.Size(22, 32);
		marker.setIcon({
			url: iconURL,
			size: iconSize,
			scaledSize: iconSize
		});
	});

	self.map.addListener('zoom_changed', function() {
		self.map.addListener('idle', function() {
			var spidered = self.oms.markersNearAnyOtherMarker();
			for (var i = 0; i < spidered.length; i ++) {
				spidered[i].icon.url = self.config['template_path'] + '/NAMarkerR.png';
			}
		});
	});

	// This is necessary to make the Spiderfy work
	self.oms.addListener('click', function (marker) {
		marker.zIndex = 999;
		infoWindow.setContent(marker.desc);
		infoWindow.open(self.map, marker);
	});
	// Add some markers to the map.
	// Note: The code uses the JavaScript Array.prototype.map() method to
	// create an array of markers based on a given "locations" array.
	// The map() method here has nothing to do with the Google Maps API.
	self.meetingData.map(function (location, i) {
		if (location.venue_type == venueType.VIRTUAL) return;
		var marker_html = '<dl><dt><strong>';
		marker_html += location.meeting_name;
		marker_html += '</strong></dt>';
		marker_html += '<dd><em>';
		marker_html += self.localization.getDayOfTheWeekWord(location.weekday_tinyint);
		var time = location.start_time.toString().split(':');
		var hour = parseInt(time[0]);
		var minute = parseInt(time[1]);
		var pm = 'AM';
		if (hour >= 12) {
			pm = 'PM';
			if (hour > 12) {
				hour -= 12;
			}
		}
		hour = hour.toString();
		minute = (minute > 9) ? minute.toString() : ('0' + minute.toString());
		marker_html += ' ' + hour + ':' + minute + ' ' + pm;
		marker_html += '</em><br>';
		marker_html += location.location_text;
		marker_html += '<br>';

		if (typeof location.location_street !== "undefined") {
			marker_html += location.location_street + '<br>';
		}
		if (typeof location.location_municipality !== "undefined") {
			marker_html += location.location_municipality + ' ';
		}
		if (typeof location.location_province !== "undefined") {
			marker_html += location.location_province + ' ';
		}
		if (typeof location.location_postal_code_1 !== "undefined") {
			marker_html += location.location_postal_code_1;
		}

		marker_html += '<br>';
		var url = 'https://maps.google.com/maps?q=' + location.latitude + ',' + location.longitude + '&hl=' + self.config['short_language'];
		marker_html += '<a target=\"_blank\" href="' + url + '">';
		marker_html += self.localization.getWord('map');
		marker_html += '</a>';
		marker_html += '</dd></dl>';

		var latLng = {"lat": parseFloat(location.latitude), "lng": parseFloat(location.longitude)};

		var marker = new google.maps.Marker({
			position: latLng
		});

		marker['id'] = location['id_bigint'];
		marker['day_id'] = location['weekday_tinyint'];

		self.addToMapObjectCollection(marker);
		self.oms.addMarker(marker);

		self.map_clusters.push(marker);
		google.maps.event.addListener(marker, 'click', function (evt) {
			jQuery(".bmlt-data-row > td").removeClass("rowHighlight");
			jQuery("#meeting-data-row-" + marker['id'] + " > td").addClass("rowHighlight");
			self.dayTab(marker['day_id']);
			infoWindow.setContent(marker_html);
			infoWindow.open(self.map, marker);
		});
		return marker;
	});

	// Add a marker clusterer to manage the markers.
	self.markerClusterer = new MarkerClusterer(self.map, self.map_clusters, {
		imagePath: self.config['template_path'] + '/m',
		maxZoom: self.config['map_max_zoom'],
		zoomOnClick: false
	});

	if (callback !== undefined && isFunction(callback)) callback();
};

function getTrueResult(options, ctx) {
	return options.fn !== undefined ? options.fn(ctx) : true;
}

function getFalseResult(options, ctx) {
	return options.inverse !== undefined ? options.inverse(ctx) : false;
}

// [deprecated] Retire after root server 2.16.4 is rolled out everywhere.
function getMasterFormatId(code, data) {
	for (var f = 0; f < crouton.masterFormatCodes.length; f++) {
		var format = crouton.masterFormatCodes[f];
		if (format['key_string'] === code && format['root_server_uri'] === data['root_server_uri']) {
			return format['id'];
		}
	}
}

// [deprecated] Retire after root server 2.16.4 is rolled out everywhere.
var masterFormatVenueType = {
	IN_PERSON: "IN_PERSON",
	VIRTUAL: "VIRTUAL",
}

var venueType = {
	IN_PERSON: 1,
	VIRTUAL: 2,
	HYBRID: 3,
}

function getVenueTypeName(data) {
	if (data['venue_type'] === venueType.HYBRID || inArray(getMasterFormatId('HY', data), getFormats(data))) {
		return [crouton.localization.getVenueType(masterFormatVenueType.VIRTUAL), crouton.localization.getVenueType(masterFormatVenueType.IN_PERSON)];
	} else if (data['venue_type'] === venueType.VIRTUAL || inArray(getMasterFormatId('VM', data), getFormats(data))) {
		return [crouton.localization.getVenueType(masterFormatVenueType.VIRTUAL)];
	} else {
		return [crouton.localization.getVenueType(masterFormatVenueType.IN_PERSON)];
	}
}

// TODO: Change this logic when https://github.com/bmlt-enabled/bmlt-root-server/issues/353 is released and rolled out everywhere.
function getFormats(data) {
	return data['formats'] !== "" ? data['format_shared_id_list'].split(",") : [];
}

crouton_Handlebars.registerHelper('getDayOfTheWeek', function(day_id) {
	return hbs_Crouton.localization.getDayOfTheWeekWord(day_id);
});

crouton_Handlebars.registerHelper('getWord', function(word) {
	var translation = hbs_Crouton.localization.getWord(word);
	if (translation) return translation;
	// if none found, return the untranslated - better than nothing.
	return word;
});

crouton_Handlebars.registerHelper('formatDataPointer', function(str) {
	return convertToPunyCode(str);
});

crouton_Handlebars.registerHelper('canShare', function(data, options) {
	return navigator.share ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * @deprecated Since version 3.12.2, will be removed in a future version.
 */
crouton_Handlebars.registerHelper('isVirtual', function(data, options) {
	return ((data['venue_type'] === venueType.HYBRID || data['venue_type'] === venueType.VIRTUAL) || ((inArray(getMasterFormatId('HY', data), getFormats(data)) && !inArray(getMasterFormatId('TC', data), getFormats(data)))
		|| inArray(getMasterFormatId('VM', data), getFormats(data))))
	&& (data['virtual_meeting_link'] || data['phone_meeting_number'] || data['virtual_meeting_additional_info']) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * Assumes consistent set of venue type formats (enforced for newly edited meetings in root server 2.16.0 or greater)
 */
crouton_Handlebars.registerHelper('isVirtualOnly', function(data, options) {
	return data['venue_type'] === venueType.VIRTUAL || inArray(getMasterFormatId('VM', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * @deprecated Since version 3.12.2 will be removed in a future version.
 */
crouton_Handlebars.registerHelper('isHybrid', function(data, options) {
	return data['venue_type'] === venueType.HYBRID || inArray(getMasterFormatId('HY', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * Assumes consistent set of venue type formats (enforced for newly edited meetings in root server 2.16.0 or greater)
 */
crouton_Handlebars.registerHelper('isHybridOnly', function(data, options) {
	return data['venue_type'] === venueType.HYBRID || inArray(getMasterFormatId('HY', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

crouton_Handlebars.registerHelper('isTemporarilyClosed', function(data, options) {
	return inArray(getMasterFormatId('TC', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

crouton_Handlebars.registerHelper('isNotTemporarilyClosed', function(data, options) {
	return !inArray(getMasterFormatId('TC', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * Assumes consistent set of venue type formats (enforced for newly edited meetings in root server 2.16.0 or greater)
 */
crouton_Handlebars.registerHelper('isInPersonOrHybrid', function(data, options) {
	return data['venue_type'] !== venueType.VIRTUAL && !inArray(getMasterFormatId('VM', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * Assumes consistent set of venue type formats (enforced for newly edited meetings in root server 2.16.0 or greater)
 */
crouton_Handlebars.registerHelper('isInPersonOnly', function(data, options) {
	return data['venue_type'] === venueType.IN_PERSON || (!inArray(getMasterFormatId('VM', data), getFormats(data))
	&& !inArray(getMasterFormatId('HY', data), getFormats(data))) ? getTrueResult(options, this) : getFalseResult(options, this);
});

/**
 * Assumes consistent set of venue type formats (enforced for newly edited meetings in root server 2.16.0 or greater)
 */
crouton_Handlebars.registerHelper('isVirtualOrHybrid', function(data, options) {
	return (data['venue_type'] === venueType.VIRTUAL || data['venue_type'] === venueType.HYBRID) || inArray(getMasterFormatId('VM', data), getFormats(data))
	|| inArray(getMasterFormatId('HY', data), getFormats(data)) ? getTrueResult(options, this) : getFalseResult(options, this);
});

crouton_Handlebars.registerHelper('hasFormats', function(formats, data, options) {
	var allFound = false;
	var formatsResponse = data['formats'].split(",")
	var formatsParam = formats.split(",");
	for (var i = 0; i < formatsParam.length; i++) {
		allFound = inArray(formatsParam[i], formatsResponse);
	}

	return allFound ? getTrueResult(options, this) : getFalseResult(options, this);
});

crouton_Handlebars.registerHelper('temporarilyClosed', function(data, options) {
	if (data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('TC', data)) !== undefined) {
		return data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('TC', data))['description'];
	} else {
		return "FACILITY IS TEMPORARILY CLOSED";
	}
});

crouton_Handlebars.registerHelper('meetsVirtually', function(data, options) {
	if (data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('VM', data)) !== undefined) {
		return data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('VM', data))['description'];
	} else {
		return "MEETS VIRTUALLY";
	}
});

crouton_Handlebars.registerHelper('meetsHybrid', function(data, options) {
	if (data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('HY', data)) !== undefined) {
		return data['formats_expanded'].getArrayItemByObjectKeyValue('id', getMasterFormatId('HY', data))['description'];
	} else {
		return "MEETS VIRTUALLY AND IN PERSON";
	}
});

crouton_Handlebars.registerHelper('qrCode', function(link, options) {
	return new crouton_Handlebars.SafeString("<img alt='qrcode' src='https://chart.googleapis.com/chart?chs=100x100&cht=qr&chl=" + link + "&choe=UTF-8&chld=L|0'>");
});

crouton_Handlebars.registerHelper('formatDataFromArray', function(arr) {
	var finalValues = [];
	for (var i = 0; i < arr.length; i++) {
		finalValues.push(convertToPunyCode(arr[i]));
	}

	return finalValues.join(" ");
});

crouton_Handlebars.registerHelper('formatDataPointerFormats', function(formatsExpanded) {
	var finalFormats = [];
	for (var i = 0; i < formatsExpanded.length; i++) {
		finalFormats.push(convertToPunyCode(formatsExpanded[i]['name']));
	}
	return finalFormats.join(" ");
});

crouton_Handlebars.registerHelper('formatDataKeyFormats', function(formatsExpanded) {
	var finalFormats = [];
	for (var i = 0; i < formatsExpanded.length; i++) {
		finalFormats.push(convertToPunyCode(formatsExpanded[i]['key']));
	}
	return finalFormats.join(" ");
});

crouton_Handlebars.registerHelper('formatLink', function(text) {
	if (text.indexOf('tel:') === 0 || text.indexOf('http') === 0) {
		return new crouton_Handlebars.SafeString("<a href='" + text + "' target='_blank'>" + text + "</a>");
	} else {
		return text;
	}
});

crouton_Handlebars.registerHelper('webLinkify', function(text) {
	return new crouton_Handlebars.SafeString("<a href='" + text + "' target='_blank'>" + text + "</a>");
});

crouton_Handlebars.registerHelper('phoneLinkify', function(text) {
	return new crouton_Handlebars.SafeString("<a href='tel:" + text + "' target='_blank'>" + text + "</a>");
});

crouton_Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
	return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
});

crouton_Handlebars.registerHelper('greaterThan', function (arg1, arg2, options) {
	return (arg1 > arg2) ? options.fn(this) : options.inverse(this);
});

crouton_Handlebars.registerHelper('lessThan', function (arg1, arg2, options) {
	return (arg1 < arg2) ? options.fn(this) : options.inverse(this);
});

crouton_Handlebars.registerHelper('times', function(n, block) {
	var accum = '';
	for(var i = 1; i <= n; ++i)
		accum += block.fn(i);
	return accum;
});

function convertToPunyCode(str) {
	return str !== undefined ? punycode.toASCII(str.toLowerCase()).replace(/\W|_/g, "-") : "";
}

function arrayColumn(input, columnKey) {
	var newArr = [];
	for (var i = 0; i < input.length; i++) {
		newArr.push(input[i][columnKey]);
	}

	return newArr;
}

function getUniqueValuesOfKey(array, key){
	return array.reduce(function(carry, item){
		if(item[key] && !~carry.indexOf(item[key])) carry.push(item[key]);
		return carry;
	}, []);
}

function getValuesFromObject(o) {
	var arr = [];
	for (key in o) {
		if (o.hasOwnProperty(key)) {
			arr.push(o[key]);
		}
	}

	return arr;
}
function getUniqueFormatsOfType(array, type){
	var x = array.reduce(function(carry, val){
		if (!(val.formats_expanded)) return carry;
		var fmts = val.formats_expanded.filter((item) => item.type===type);
		if (fmts) {
			carry = carry.concat(fmts.filter((item) => carry.map(f => f.key).indexOf(item.key) < 0));
		}
		return carry;
	},[]);
	return x;
}
Crouton.prototype.getAdjustedDateTime = function(meeting_day, meeting_time, meeting_time_zone) {
	var timeZoneAware = this.config['auto_tz_adjust'] === true || this.config['auto_tz_adjust'] === "true";
	var meeting_date_time_obj;
	if (timeZoneAware) {
		if (!meeting_time_zone) {
			meeting_time_zone = "UTC";
		}
    	// Get an object that represents the meeting in its time zone
    	meeting_date_time_obj = moment.tz(meeting_time_zone).set({
    		hour: meeting_time.split(":")[0],
    		minute: meeting_time.split(":")[1],
    		second: 0
    	}).isoWeekday(meeting_day);

    	// Convert meeting to target (local) time zone
    	meeting_date_time_obj = meeting_date_time_obj.clone().tz(moment.tz.guess());
	} else {
    	meeting_date_time_obj = moment().set({
    		hour: meeting_time.split(":")[0],
    		minute: meeting_time.split(":")[1],
    		second: 0
    	}).isoWeekday(meeting_day);
	}

	var now = timeZoneAware ? moment.tz(moment.tz.guess()) : moment();
	if (now > meeting_date_time_obj) {
		meeting_date_time_obj.add(1, 'weeks');
	} else if (now.isoWeekday() == meeting_date_time_obj.isoWeekday() && meeting_date_time_obj.diff(now, 'days') == 0) {
		meeting_date_time_obj.add(1, 'weeks');
	}

	return meeting_date_time_obj;
};

function arrayUnique(a, b, c) {
	b = a.length;
	while (c = --b)
		while (c--) a[b] !== a[c] || a.splice(c, 1);
	return a
}

function sortListByList(source, truth) {
	var goal = [];
	for (var x = 0; x < truth.length; x++) {
		for (var y = 0; y < source.length; y++) {
			if (truth[x] === source[y]) {
				goal.push(source[y])
			}
		}
	}

	return goal;
}

function inArray(needle, haystack) {
	return haystack.indexOf(needle) !== -1;
}

function isFunction(functionToCheck) {
	return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function getServiceBodiesQueryString(service_bodies_id) {
	var service_bodies_query = "";
	for (var x = 0; x < service_bodies_id.length; x++) {
		service_bodies_query += "&services[]=" + service_bodies_id[x];
	}
	return service_bodies_query;
}

Array.prototype.clone = function() {
	return this.slice();
}

Array.prototype.filterByObjectKeyValue = function(key, value) {
	var ret = [];
	for (var i = 0; i < this.length; i++) {
		if (this[i][key] === value) {
			ret.push(this[i])
		}
	}

	return ret;
};

Array.prototype.getArrayItemByObjectKeyValue = function(key, value) {
	for (var i = 0; i < this.length; i++) {
		if (this[i][key] === value) {
			return this[i];
		}
	}
};

Array.prototype.clean = function() {
	for (var i = 0; i < this.length; i++) {
		if (this[i] === "") {
			this.splice(i, 1);
			i--;
		}
	}
	return this;
};

Array.prototype.exclude = function(excludedValues, mappedField) {
	for (var i = this.length; i--;) {
		for (var j = 0; j < excludedValues.length; j++) {
			if (excludedValues[j] === this[i][mappedField]) {
				this.splice(i, 1);
			}
		}
	}
	return this;
};

Array.prototype.sortByKey = function (key) {
	this.sort(function (a, b) {
		if (a[key] < b[key])
			return -1;
		if (a[key] > b[key])
			return 1;
		return 0;
	});
	return this;
};

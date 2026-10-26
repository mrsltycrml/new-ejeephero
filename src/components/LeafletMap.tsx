import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { scriptJson } from '../utils/scriptJson';
import { RouteData, TerminalData, VehicleData } from '../services/offlineTransitService';
import { StopSafetyProfile, LateNightSafeRoutingResult } from '../services/densityRoutingService';
import { GeofenceEvaluationResult, DEFAULT_CONFIGURED_BAY_RADIUS_METERS } from '../services/geofencingService';
import {
  MAKATI_BOUNDS,
  MAKATI_CENTER,
  MAKATI_MIN_ZOOM,
  MAKATI_MAX_ZOOM,
  MAKATI_DEFAULT_ZOOM,
  WORLD_MASK_OUTER_RING,
  MAKATI_BOUNDARY_COORDINATES,
} from '../constants/makatiBoundary';

export interface LeafletMapRef {
  centerOn: (latitude: number, longitude: number, zoom?: number) => void;
  animateToRegion: (
    region: { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number },
    duration?: number
  ) => void;
}

interface LeafletMapProps {
  routes: RouteData[];
  terminals: TerminalData[];
  vehicles: VehicleData[];
  userLocation?: { latitude: number; longitude: number } | null;
  destinationPlace?: { name: string; latitude: number; longitude: number } | null;
  hideOccupancy?: boolean;
  geofenceResult?: GeofenceEvaluationResult | null;
  densityProfiles?: Map<string, StopSafetyProfile>;
  safeRoutingResult?: LateNightSafeRoutingResult | null;
  selectedTerminal?: TerminalData | null;
  selectedVehicle?: VehicleData | null;
  fleetMode?: boolean;
  isOffline?: boolean;
  onSelectTerminal?: (terminal: TerminalData) => void;
  onSelectVehicle?: (vehicle: VehicleData) => void;
}

const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(({
  routes,
  terminals,
  vehicles,
  userLocation,
  destinationPlace,
  hideOccupancy = false,
  geofenceResult,
  densityProfiles,
  safeRoutingResult,
  selectedTerminal,
  selectedVehicle,
  fleetMode = false,
  isOffline = false,
  onSelectTerminal,
  onSelectVehicle,
}, ref) => {
  const webViewRef = useRef<any>(null);
  const NativeWebView = WebView as React.ComponentType<any>;
  const isWeb = Platform.OS === 'web';
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Expose imperative methods to parent (like recenter)
  useImperativeHandle(ref, () => ({
    centerOn: (latitude: number, longitude: number, zoom = 16) => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(zoom)) return;
      const clampedZoom = Math.min(Math.max(zoom, MAKATI_MIN_ZOOM), MAKATI_MAX_ZOOM);
      const js = `if (window.leafletMap) { window.leafletMap.flyTo([${latitude}, ${longitude}], ${clampedZoom}, { duration: 0.8 }); }`;
      if (isWeb && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'CENTER', latitude, longitude, zoom: clampedZoom }, '*');
      } else {
        webViewRef.current?.injectJavaScript(js + '; true;');
      }
    },
    animateToRegion: (region) => {
      if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return;
      const rawZoom = region.latitudeDelta && region.latitudeDelta < 0.01 ? 17 : 16;
      const clampedZoom = Math.min(Math.max(rawZoom, MAKATI_MIN_ZOOM), MAKATI_MAX_ZOOM);
      const js = `if (window.leafletMap) { window.leafletMap.flyTo([${region.latitude}, ${region.longitude}], ${clampedZoom}, { duration: 0.8 }); }`;
      if (isWeb && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'CENTER', latitude: region.latitude, longitude: region.longitude, zoom: clampedZoom }, '*');
      } else {
        webViewRef.current?.injectJavaScript(js + '; true;');
      }
    },
  }));

  // Serializable payload for the webview
  const mapData = useMemo(() => {
    const serializedProfiles: Record<string, { crowdCount: number; densityLevel: string }> = {};
    if (densityProfiles) {
      densityProfiles.forEach((v, k) => {
        serializedProfiles[k] = {
          crowdCount: v.crowdCount,
          densityLevel: v.densityLevel,
        };
      });
    }

    return {
      routes: routes.filter(r => Boolean(r.geometry_verified_at && r.geometry_source_url) && r.coordinates?.length > 1).map(r => ({
        id: r.id,
        name: r.name,
        color_code: r.color_code,
        coordinates: r.coordinates,
      })),
      terminals: terminals.filter(t => Boolean(t.location_verified_at && t.location_source_url)).map(t => ({
        id: t.id,
        name: t.name,
        latitude: t.latitude,
        longitude: t.longitude,
        geofenceRadiusMeters: t.geofence_radius_meters,
        is_esakay_hub: t.is_esakay_hub,
        isInside: geofenceResult?.currentZone?.id === t.id,
        isRecommended: safeRoutingResult?.recommendedSafeStop?.id === t.id,
        isSelected: selectedTerminal?.id === t.id,
        profile: serializedProfiles[t.id] || { crowdCount: 0, densityLevel: 'Normal' },
      })),
      vehicles: vehicles.map(v => ({
        id: v.id,
        body_number: v.body_number,
        plate_number: v.plate_number,
        latitude: v.latitude,
        longitude: v.longitude,
        status: v.status,
        passenger_count: v.passenger_count,
        max_capacity: v.max_capacity,
        speed: v.speed,
        isSpeeding: Boolean(v.isSpeeding),
        isSample: Boolean(v.is_sample),
        isSelected: selectedVehicle?.id === v.id,
      })),
      userLocation: userLocation || null,
      destinationPlace: destinationPlace || null,
      hideOccupancy,
      bayRadius: DEFAULT_CONFIGURED_BAY_RADIUS_METERS,
      isOffline: Boolean(isOffline),
    };
  }, [
    routes,
    terminals,
    vehicles,
    userLocation,
    destinationPlace,
    hideOccupancy,
    geofenceResult,
    densityProfiles,
    safeRoutingResult,
    selectedTerminal,
    selectedVehicle,
    isOffline,
  ]);

  const initialDataRef = useRef(mapData);
  const latestMapDataRef = useRef(mapData);
  latestMapDataRef.current = mapData;

  const pushLatestData = () => {
    const current = latestMapDataRef.current;
    const dataStr = scriptJson(current);
    const js = `if (window.renderMapData) { window.renderMapData(${dataStr}); }`;
    if (isWeb && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'UPDATE_DATA', data: current }, '*');
    } else {
      webViewRef.current?.injectJavaScript(js + '; true;');
    }
  };

  // Push data updates dynamically to avoid reloading the page
  useEffect(() => {
    pushLatestData();
  }, [mapData, isWeb]);

  const htmlContent = useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: https://tile.openstreetmap.org https://unpkg.com; connect-src 'none'; base-uri 'none'; form-action 'none'" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background-color: #edf1f3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    
    /* Terminal Marker */
    .terminal-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .terminal-pin {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background-color: #203B53;
      border: 2px solid #FFFFFF;
      box-shadow: 0 1px 4px rgba(22, 38, 52, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .terminal-pin.selected {
      background-color: #A62B36;
      transform: scale(1.08);
      border-color: #FFFFFF;
    }
    .terminal-pin.safe-recommended {
      border-color: #C89A43;
      box-shadow: 0 0 0 2px rgba(200, 154, 67, 0.25);
    }
    .terminal-badge {
      position: absolute;
      top: -6px;
      right: -6px;
      border-radius: 10px;
      padding: 1px 5px;
      font-size: 10px;
      font-weight: bold;
      color: #fff;
      border: 1.5px solid #fff;
      box-shadow: 0 1px 3px rgba(22, 38, 52, 0.22);
    }

    /* Vehicle Marker */
    .vehicle-marker-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .vehicle-pill {
      background: #FFFFFF;
      padding: 2px 7px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(22, 38, 52, 0.18);
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 4px;
      border: 1px solid #DCE2E8;
    }
    .vehicle-pill .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .vehicle-icon-circle {
      width: 28px;
      height: 28px;
      border-radius: 14px;
      background: #FFFFFF;
      border: 2px solid #A62B36;
      box-shadow: 0 1px 4px rgba(22, 38, 52, 0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      color: #203B53;
    }
    .vehicle-icon-circle.selected {
      outline: 3px solid #A62B36;
      outline-offset: 2px;
    }

    /* User Pulse Dot */
    .user-pulse-container {
      position: relative;
      width: 20px;
      height: 20px;
    }
    .user-pulse-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #2196F3;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 6px rgba(33, 150, 243, 0.8);
      position: absolute;
      top: 3px;
      left: 3px;
    }
    .user-pulse-ring {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(33, 150, 243, 0.35);
      position: absolute;
      top: -4px;
      left: -4px;
      animation: pulse 1.8s infinite ease-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.4); opacity: 0; }
    }
    .leaflet-control-attribution { font-size: 9px !important; }

    /* Offline Status Badge */
    .offline-badge {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: rgba(15, 23, 42, 0.90);
      color: #f8fafc;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(255,255,255,0.2);
      pointer-events: none;
    }
    .offline-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #f59e0b;
      box-shadow: 0 0 6px #f59e0b;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="offline-badge" class="offline-badge" style="display: none;">
    <span class="offline-dot"></span> Offline Makati Map Active
  </div>
  <script>
    function escapedMapText(value) { return String(value).replace(/[&<>"']/g, function(c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
    if (typeof L === 'undefined') {
      document.getElementById('offline-badge').style.display = 'flex';
      window.renderMapData = function(data) {
        var mapEl = document.getElementById('map');
        if (!mapEl) return;
        var terms = (data && data.terminals) || [];
        var listHtml = terms.slice(0, 10).map(function(t) {
          return '<div style="padding:8px 12px;margin:4px 0;background:#fff;border-radius:8px;border:1px solid #dce2e8;font-size:12px;color:#1f2d3a;font-weight:600;">' +
            escapedMapText(t.name) + ' <span style="color:#778493;font-weight:400;">(' + Number(t.latitude).toFixed(4) + ', ' + Number(t.longitude).toFixed(4) + ')</span></div>';
        }).join('');
        mapEl.innerHTML = '<div style="padding:16px;padding-top:48px;height:100%;overflow-y:auto;background:#f4f1ea;">' +
          '<div style="font-size:14px;font-weight:800;color:#A62B36;margin-bottom:8px;">Offline Makati Transit Schematic</div>' +
          listHtml + '</div>';
      };
      window.renderMapData(${scriptJson(initialDataRef.current)});
    } else {
    // The fleet view covers the full Makati–Mandaluyong corridor.
    // Passenger maps retain the existing Makati-focused bounds.
    var MAKATI_BOUNDS = ${JSON.stringify(MAKATI_BOUNDS)};
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      minZoom: ${fleetMode ? 11 : MAKATI_MIN_ZOOM},
      maxZoom: ${MAKATI_MAX_ZOOM},
      maxBounds: ${fleetMode ? 'undefined' : 'MAKATI_BOUNDS'},
      maxBoundsViscosity: ${fleetMode ? 0 : 1},
      bounceAtZoomLimits: true
    }).setView([${fleetMode ? 14.567 : MAKATI_CENTER.latitude}, ${fleetMode ? 121.033 : MAKATI_CENTER.longitude}], ${fleetMode ? 14 : MAKATI_DEFAULT_ZOOM});
    window.leafletMap = map;

    // 2. IDEA 3: OFFLINE TILE CACHING & FALLBACK
    // Cache tiles in CacheStorage when online; serve offline instantly; fallback gracefully to SVG pattern.
    function createFallbackTileSvg() {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
        '<rect width="256" height="256" fill="#f4f1ea" stroke="#e4ded3" stroke-width="1"/>' +
        '<path d="M0,64 L256,64 M0,128 L256,128 M0,192 L256,192 M64,0 L64,256 M128,0 L128,256 M192,0 L192,256" stroke="#eae4d8" stroke-width="0.8"/>' +
        '</svg>';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    var OfflineTileLayer = L.TileLayer.extend({
      createTile: function(coords, done) {
        var tile = document.createElement('img');
        tile.setAttribute('role', 'presentation');
        var url = this.getTileUrl(coords);

        // Opaque-origin frames and private browsers can throw even when reading
        // CacheStorage. Keep isolation and fall back to ordinary image requests.
        var tileCaches = null;
        try { tileCaches = window.caches; } catch (_) {}
        if (tileCaches) {
          tileCaches.open('ejeep-makati-tiles-v1').then(function(cache) {
            cache.match(url).then(function(cachedResponse) {
              if (cachedResponse) {
                cachedResponse.blob().then(function(blob) {
                  tile.src = URL.createObjectURL(blob);
                  done(null, tile);
                }).catch(function() {
                  tile.src = url;
                  done(null, tile);
                });
              } else {
                fetch(url, { mode: 'cors' })
                  .then(function(netResponse) {
                    if (netResponse.ok) {
                      cache.put(url, netResponse.clone()).catch(function() {});
                      return netResponse.blob();
                    }
                    throw new Error('Tile network error');
                  })
                  .then(function(blob) {
                    tile.src = URL.createObjectURL(blob);
                    done(null, tile);
                  })
                  .catch(function() {
                    tile.src = createFallbackTileSvg();
                    done(null, tile);
                  });
              }
            }).catch(function() {
              tile.src = url;
              done(null, tile);
            });
          }).catch(function() {
            tile.src = url;
            done(null, tile);
          });
        } else {
          tile.src = url;
          L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
          L.DomEvent.on(tile, 'error', function() {
            tile.src = createFallbackTileSvg();
            done(null, tile);
          });
        }

        return tile;
      }
    });

    // Standard OSM tiles use normal browser caching; do not bulk-cache them
    // for offline use. The route and live markers remain available separately.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: ${fleetMode ? 11 : MAKATI_MIN_ZOOM},
      maxZoom: ${MAKATI_MAX_ZOOM}
    }).addTo(map);

    // Keep the city mask in the passenger view; it would obscure Mandaluyong units.
    if (!${fleetMode}) {
    var worldRing = ${JSON.stringify(WORLD_MASK_OUTER_RING)};
    var makatiCoords = ${JSON.stringify(MAKATI_BOUNDARY_COORDINATES)};
    L.polygon([worldRing, makatiCoords], {
      fillColor: '#0f172a',
      fillOpacity: 0.38,
      stroke: false,
      interactive: false
    }).addTo(map);

    // High-contrast accent border along official Makati City boundary
    L.polyline(makatiCoords, {
      color: '#C41E3A',
      weight: 2.5,
      opacity: 0.85,
      dashArray: '5, 5',
      interactive: false
    }).addTo(map);
    }

    // Layer Groups
    var routesLayer = L.layerGroup().addTo(map);
    var geofencesLayer = L.layerGroup().addTo(map);
    var terminalsLayer = L.layerGroup().addTo(map);
    var vehiclesLayer = L.layerGroup().addTo(map);
    var userLayer = L.layerGroup().addTo(map);

    function sendEvent(type, data) {
      var msg = JSON.stringify({ type: type, ...data });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent) {
        window.parent.postMessage(msg, '*');
      }
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function(character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
      });
    }

    window.renderMapData = function(data) {
      if (!data) return;

      // Update offline badge
      var offlineBadge = document.getElementById('offline-badge');
      if (offlineBadge) {
        offlineBadge.style.display = data.isOffline ? 'flex' : 'none';
      }

      // 1. Draw Routes
      routesLayer.clearLayers();
      var polylines = [];
      if (data.routes) {
        data.routes.forEach(function(route) {
          if (route.coordinates && route.coordinates.length > 0) {
            var latlngs = route.coordinates.map(function(c) { return [c.latitude, c.longitude]; });
            var p = L.polyline(latlngs, {
              color: route.color_code || '#C41E3A',
              weight: 5,
              opacity: 0.85
            }).addTo(routesLayer);
            polylines.push(p);
          }
        });
      }
      if (!window.hasAutoFitted && polylines.length > 0 && !data.userLocation) {
        try {
          var group = L.featureGroup(polylines);
          map.fitBounds(group.getBounds().pad(0.08));
          window.hasAutoFitted = true;
        } catch(err) {}
      }

      // 2. Draw Terminals & Geofence Circles
      geofencesLayer.clearLayers();
      terminalsLayer.clearLayers();
      if (data.terminals) {
        data.terminals.forEach(function(term) {
          // Geofence Circle
          var circleColor = term.isInside ? '#4CAF50' : '#C41E3A';
          var fillColor = term.isInside ? 'rgba(76, 175, 80, 0.25)' : 'rgba(196, 30, 58, 0.12)';
          L.circle([term.latitude, term.longitude], {
            radius: term.geofenceRadiusMeters || data.bayRadius || 45,
            color: circleColor,
            fillColor: fillColor,
            fillOpacity: 0.25,
            weight: 1.5
          }).addTo(geofencesLayer);

          // Marker
          var badgeColor = term.profile.densityLevel.indexOf('High') !== -1 ? '#4CAF50' : (term.profile.densityLevel.indexOf('Moderate') !== -1 ? '#FF9800' : '#757575');
          var iconSymbol = term.is_esakay_hub ? 'H' : 'S';
          var pinClasses = 'terminal-pin' + (term.isSelected ? ' selected' : '') + (term.isRecommended ? ' safe-recommended' : '');
          
          var html = '<div class="terminal-marker">' +
            '<div class="' + pinClasses + '">' + iconSymbol + '</div>' +
            '<div class="terminal-badge" style="background-color:' + badgeColor + '">' + Number(term.profile.crowdCount || 0) + '</div>' +
            '</div>';

          var markerIcon = L.divIcon({
            className: 'custom-terminal-icon',
            html: html,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });

          var marker = L.marker([term.latitude, term.longitude], { icon: markerIcon }).addTo(terminalsLayer);
          marker.on('click', function() {
            sendEvent('SELECT_TERMINAL', { id: term.id });
          });
        });
      }

      // 3. Draw Vehicles
      vehiclesLayer.clearLayers();
      if (data.vehicles) {
        data.vehicles.forEach(function(veh) {
          var isPuno = veh.status === 'Puno';
          var isSakto = veh.status === 'Sakto';
          var statusColor = veh.isSpeeding ? '#D32F2F' : (isPuno ? '#F44336' : (isSakto ? '#FF9800' : '#4CAF50'));
          var vehicleStatusText = veh.isSample ? 'Sample' : (data.hideOccupancy ? 'Live' : (veh.isSpeeding ? 'SPEEDING' : veh.status));
          if (data.hideOccupancy) statusColor = '#B63D32';

          var vHtml = '<div class="vehicle-marker-wrapper">' +
            '<div class="vehicle-pill" style="border-color:' + statusColor + '; color:' + statusColor + ';">' +
            '<span class="dot" style="background-color:' + statusColor + ';"></span>' +
            escapeHtml(veh.body_number || veh.plate_number || 'Vehicle') + ' • ' + escapeHtml(vehicleStatusText) +
            '</div>' +
            '<div class="vehicle-icon-circle' + (veh.isSelected ? ' selected' : '') + '" style="border-color:' + statusColor + ';">' +
            'EJ' +
            '</div>' +
            '</div>';

          var vIcon = L.divIcon({
            className: 'custom-veh-icon',
            html: vHtml,
            iconSize: [80, 50],
            iconAnchor: [40, 46]
          });

          var vMarker = L.marker([veh.latitude, veh.longitude], { icon: vIcon }).addTo(vehiclesLayer);
          vMarker.on('click', function() {
            sendEvent('SELECT_VEHICLE', { id: veh.id });
          });
        });
        var tracked = data.vehicles.find(function(veh) { return veh.isSelected; });
        if (tracked) {
          var trackKey = tracked.id + ':' + Number(tracked.latitude).toFixed(5) + ':' + Number(tracked.longitude).toFixed(5);
          if (window.lastTrackedVehicle !== trackKey) {
            map.flyTo([tracked.latitude, tracked.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
            window.lastTrackedVehicle = trackKey;
          }
        } else {
          window.lastTrackedVehicle = null;
        }
      }

      // 4. Draw User Location
      userLayer.clearLayers();
      if (data.destinationPlace) {
        var placeLabel = document.createElement('span');
        placeLabel.textContent = 'Destination: ' + data.destinationPlace.name;
        L.marker([data.destinationPlace.latitude, data.destinationPlace.longitude], { title: 'Destination: ' + data.destinationPlace.name }).bindPopup(placeLabel).addTo(userLayer);
      }
      if (data.userLocation) {
        var uHtml = '<div class="user-pulse-container">' +
          '<div class="user-pulse-ring"></div>' +
          '<div class="user-pulse-dot"></div>' +
          '</div>';
        var uIcon = L.divIcon({
          className: 'custom-user-icon',
          html: uHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        L.marker([data.userLocation.latitude, data.userLocation.longitude], { icon: uIcon }).addTo(userLayer);
      }
    };

    // Initial render
    window.renderMapData(${scriptJson(initialDataRef.current)});
    }

    // Handle iframe messages on web
    window.addEventListener('message', function(e) {
      if (e.source !== window.parent) return;
      if (e.data && e.data.type === 'UPDATE_DATA') {
        window.renderMapData(e.data.data);
      } else if (e.data && e.data.type === 'CENTER' && window.leafletMap) {
        var lat=Number(e.data.latitude), lon=Number(e.data.longitude), zoom=Number(e.data.zoom);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(zoom)) window.leafletMap.flyTo([lat,lon],Math.min(19,Math.max(10,zoom)),{duration:0.2});
      }
    });
  </script>
</body>
</html>
  `, [fleetMode]);

  const handleRawMessage = React.useCallback(
    (raw: unknown) => {
      try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || typeof data !== 'object') return;
        const payload = data as { type?: string; id?: string };
        if (payload.type === 'SELECT_TERMINAL' && onSelectTerminal) {
          const found = terminals.find((t) => t.id === payload.id);
          if (found) onSelectTerminal(found);
        } else if (payload.type === 'SELECT_VEHICLE' && onSelectVehicle) {
          const found = vehicles.find((v) => v.id === payload.id);
          if (found) onSelectVehicle(found);
        }
      } catch {
        // ignore non-map messages
      }
    },
    [onSelectTerminal, onSelectVehicle, terminals, vehicles]
  );

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const listener = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow) handleRawMessage(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [isWeb, handleRawMessage]);

  const handleMessage = (event: WebViewMessageEvent) => {
    handleRawMessage(event.nativeEvent.data);
  };

  if (isWeb) {
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          srcDoc={htmlContent}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={pushLatestData}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Leaflet Map"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativeWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadEnd={pushLatestData}
        onMessage={handleMessage}
        scrollEnabled={false}
        overScrollMode="never"
      />
    </View>
  );
});

export default LeafletMap;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f4f1ea',
  },
  map: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
});

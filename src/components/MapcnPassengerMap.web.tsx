import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type * as MapLibre from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { validPoint, type Point } from '../services/locationQuality';
import type { MapcnPassengerMapProps } from './MapcnPassengerMap.tsx';

// Map initialization adapted from https://www.mapcn.dev/r/map.json.
// Copyright (c) 2025 Anmoldeep Singh. MIT; see mapcn.LICENSE.
type MapLibrary = typeof MapLibre;
let maplibrePromise: Promise<MapLibrary> | null = null;

function loadMapLibre() {
  maplibrePromise ??= import('maplibre-gl').then(lib => {
    if (!lib.getWorkerUrl()) {
      lib.setWorkerUrl(`https://unpkg.com/maplibre-gl@${lib.getVersion()}/dist/maplibre-gl-worker.mjs`);
    }
    return lib;
  }).catch(error => {
    maplibrePromise = null;
    throw error;
  });
  return maplibrePromise;
}

const coordinates = (p: Point): [number, number] => [p.longitude, p.latitude];
const streetStyle = 'https://tiles.openfreemap.org/styles/liberty';
const sourceId = 'esakay-journey';

export default function MapcnPassengerMap({ data, controls, onFailure, onSelect, onPickCurb }: MapcnPassengerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ map: MapLibre.Map; lib: MapLibrary } | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const vehicleFocus = useRef<{ key: string | null; pending: boolean }>({ key: null, pending: false });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibre.Map | undefined;
    const fail = () => { if (!cancelled) onFailure(); };
    const timeout = setTimeout(fail, 15000);
    void loadMapLibre().then(lib => {
      if (cancelled || !containerRef.current) return;
      const instance = new lib.Map({
        container: containerRef.current,
        style: streetStyle,
        center: [121.035, 14.575],
        zoom: 13, maxZoom: 19,
        cooperativeGestures: true,
        dragRotate: false, pitchWithRotate: false,
      });
      map = instance;
      instance.touchZoomRotate.disableRotation();
      instance.addControl(new lib.NavigationControl({ showCompass: false }));
      instance.once('load', () => {
        if (cancelled) return;
        clearTimeout(timeout);
        setView({ map: instance, lib });
      });
      instance.getCanvas().addEventListener('webglcontextlost', fail, { once: true });
    }).catch(fail);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      map?.remove();
    };
  }, [onFailure]);

  useEffect(() => {
    if (!view || !onPickCurb) return;
    const pick = (event: MapLibre.MapMouseEvent) => {
      const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
      if (validPoint(point)) onPickCurb(point);
    };
    view.map.on('click', pick);
    return () => { view.map.off('click', pick); };
  }, [view, onPickCurb]);

  useImperativeHandle(controls, () => {
    const centerOn = (latitude: number, longitude: number, zoom = 16) => {
      if (!view || !validPoint({ latitude, longitude }) || !Number.isFinite(zoom)) return;
      view.map.easeTo({ center: [longitude, latitude], zoom: Math.min(19, Math.max(3, zoom)) });
    };
    return { centerOn, animateToRegion: region => centerOn(region.latitude, region.longitude, region.latitudeDelta && region.latitudeDelta < 0.01 ? 17 : 16) };
  }, [view]);

  const { routes, terminals, destinationPlace, walkingRoutes, rideCoordinates, fitPoints, cameraKey, vehicles, userLocation, selectedVehicleId, vehicleSelectionKey, vehicleFocusRequestId } = data;
  useEffect(() => {
    if (!view) return;
    const { map } = view;
    const lines: Feature<LineString>[] = [];
    const addLine = (line: Point[], kind: 'route' | 'ride' | 'walk', color: string, selected = false) => {
      if (line.length > 1) lines.push({
        type: 'Feature', geometry: { type: 'LineString', coordinates: line.map(coordinates) },
        properties: { kind, color, selected, directed: kind === 'ride' || (selected && rideCoordinates.length < 2) },
      });
    };
    for (const route of routes) {
      addLine(route.coordinates, 'route', /^#[0-9a-f]{6}$/i.test(route.color_code) ? route.color_code : '#225ca0', route.isSelected);
    }
    addLine(rideCoordinates, 'ride', '#12734a');
    for (const path of walkingRoutes) addLine(path.coordinates, 'walk', '#203b53');
    const payload = { type: 'FeatureCollection' as const, features: lines };
    const source = map.getSource<MapLibre.GeoJSONSource>(sourceId);
    if (source) {
      void source.setData(payload);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data: payload });
    map.addLayer({
      id: 'esakay-routes', type: 'line', source: sourceId, filter: ['==', ['get', 'kind'], 'route'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 6, 3], 'line-opacity': 0.75 },
    });
    map.addLayer({
      id: 'esakay-ride', type: 'line', source: sourceId, filter: ['==', ['get', 'kind'], 'ride'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#12734a', 'line-width': 8 },
    });
    map.addLayer({
      id: 'esakay-walk', type: 'line', source: sourceId, filter: ['==', ['get', 'kind'], 'walk'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#203b53', 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
    });
    const arrow = document.createElement('canvas');
    arrow.width = arrow.height = 16;
    const context = arrow.getContext('2d');
    if (context) {
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(5, 4);
      context.lineTo(10, 8);
      context.lineTo(5, 12);
      context.stroke();
      map.addImage('esakay-direction', context.getImageData(0, 0, 16, 16));
      map.addLayer({
        id: 'esakay-directions', type: 'symbol', source: sourceId, filter: ['==', ['get', 'directed'], true],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 100, 'icon-image': 'esakay-direction', 'icon-allow-overlap': true, 'icon-keep-upright': false },
      });
    }
  }, [view, routes, walkingRoutes, rideCoordinates]);

  useEffect(() => {
    if (!view) return;
    const markers = terminals.map(stop => {
      const color = stop.role === 'Landmark' || stop.role === 'Alight' ? '#a45600'
        : stop.role === 'Curb' || stop.role === 'Board' ? '#12734a' : '#225ca0';
      return addPin(view, stop, `${stop.role}: ${stop.name}`, color, stop.role[0],
        () => select.current({ type: 'SELECT_TERMINAL', id: stop.id }), stop.isSelected ? 15 : 2);
    });
    if (destinationPlace) markers.push(addPin(view, destinationPlace, destinationPlace.name, '#b22e39', 'D', undefined, 20));
    return () => { markers.forEach(marker => marker.remove()); };
  }, [view, terminals, destinationPlace]);

  useEffect(() => {
    if (!view) return;
    const markers = vehicles.map(vehicle => addPin(view, vehicle, `${vehicle.body_number || 'Vehicle'} · ${vehicle.quality === 'weak' ? 'Weak GPS' : 'Current GPS'}`,
      '#7b4339', 'V', () => select.current({ type: 'SELECT_VEHICLE', id: vehicle.id }), vehicle.isSelected ? 12 : 1));
    if (userLocation) markers.push(addPin(view, userLocation, 'Your location', '#175dcc', '●', undefined, 30));
    return () => { markers.forEach(marker => marker.remove()); };
  }, [view, vehicles, userLocation]);

  useEffect(() => {
    if (!view || !fitPoints.length) return;
    const bounds = new view.lib.LngLatBounds();
    fitPoints.forEach(point => bounds.extend(coordinates(point)));
    view.map.fitBounds(bounds, { padding: 35, maxZoom: 16, duration: 450 });
  }, [view, cameraKey]);

  useEffect(() => {
    if (!view) return;
    const identity = vehicleSelectionKey === undefined ? selectedVehicleId : vehicleSelectionKey;
    const key = identity ? JSON.stringify([identity, vehicleFocusRequestId]) : null;
    if (key !== vehicleFocus.current.key) vehicleFocus.current = { key, pending: key != null };
    const vehicle = vehicles.find(item => item.id === selectedVehicleId);
    if (!vehicleFocus.current.pending || !vehicle) return;
    view.map.easeTo({ center: coordinates(vehicle), zoom: Math.max(view.map.getZoom(), 16) });
    vehicleFocus.current.pending = false;
  }, [view, vehicles, selectedVehicleId, vehicleSelectionKey, vehicleFocusRequestId]);

  return <div style={{ position: 'absolute', inset: 0, background: '#edf1f3' }}>
    <div ref={containerRef} role="region" aria-label="eSAKAY street map" style={{ width: '100%', height: '100%' }} />
    {!view && <span role="status" style={{ position: 'absolute', top: 12, left: 12 }}>Loading street map…</span>}
  </div>;
}

function addPin(view: { map: MapLibre.Map; lib: MapLibrary }, point: Point, title: string, color: string, glyph: string, click?: () => void, zIndex = 1) {
  const element = document.createElement(click ? 'button' : 'span');
  element.textContent = glyph;
  element.title = title;
  Object.assign(element.style, {
    width: '32px', height: '32px', borderRadius: '50%', border: '2px solid white',
    background: color, color: 'white', display: 'grid', placeItems: 'center',
    font: 'bold 13px system-ui', cursor: click ? 'pointer' : 'default', padding: '0', zIndex: String(zIndex),
    boxShadow: '0 2px 4px #0005',
  });
  const marker = new view.lib.Marker({ element }).setLngLat(coordinates(point)).addTo(view.map);
  element.setAttribute('aria-label', title);
  if (click) {
    element.setAttribute('type', 'button');
    element.addEventListener('click', event => { event.stopPropagation(); click(); });
  }
  return marker;
}

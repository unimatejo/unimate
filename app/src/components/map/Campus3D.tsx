'use dom';

import { useDOMImperativeHandle, type DOMImperativeFactory } from 'expo/dom';
import maplibre from 'maplibre-gl/dist/maplibre-gl-csp.js';
import { useEffect, useRef, useState, type Ref } from 'react';

import type { CampusData } from '@/lib/campus/data';

import WORKER from '../../../.maplibre-worker.js';

import { Campus3DView, type Campus3DHandle, type Map3DProps } from './Campus3DView';
import { provideLib, type MapHandle } from './webMaps';

// MapLibre in this bundle, with its worker started from the plain-string copy (see metro.config.js)
maplibre.setWorkerUrl(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
provideLib(maplibre);

/**
 * The 3D campus on a phone: Expo runs this file in a web view, so the app shows exactly what the site shows. The
 * campus file is fetched here from its address (offline: the app's kept copy), and the camera is driven from the app
 * through the handle.
 */
export default function Campus3D({ ref, file, campus: _given, dom: _dom, getCampus, ...props }: Map3DProps & { ref?: Ref<Campus3DHandle> }) {
  const map = useRef<MapHandle>(null);
  const [campus, setCampus] = useState<CampusData | null>(null);
  const ask = useRef(getCampus);
  useEffect(() => { ask.current = getCampus; }, [getCampus]);
  useEffect(() => {
    if (!file) return;
    let live = true;
    // no internet (or a dropped download): the copy the app keeps on the phone, sent over once
    const kept = () => ask.current?.().then((d) => { if (live && d) setCampus(d); }, () => {});
    fetch(file).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setCampus(d as CampusData); }, kept);
    return () => { live = false; };
  }, [file]);
  // the app calls these across the bridge (arguments arrive as JSON, hence the loose factory type)
  const handle: Campus3DHandle = {
    animateCamera: (c, o) => map.current?.animateCamera(c, o),
    fitToCoordinates: (cs, o) => map.current?.fitToCoordinates(cs, o),
  };
  useDOMImperativeHandle(ref as Ref<DOMImperativeFactory>, () => handle as unknown as DOMImperativeFactory, []);
  return <Campus3DView ref={map} campus={campus} {...props} />;
}

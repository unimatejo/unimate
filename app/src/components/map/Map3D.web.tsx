import { forwardRef } from 'react';

import { Campus3DView, type Campus3DHandle, type Map3DProps } from './Campus3DView';

export type { Campus3DHandle };

/** The web: the 3D campus right in the page (MapLibre stays a chunk of its own, loaded when the map opens). */
const Map3D = forwardRef<Campus3DHandle, Map3DProps>(function Map3D({ campus, file: _file, dom: _dom, ...props }, ref) {
  return <Campus3DView ref={ref} campus={campus ?? null} {...props} />;
});
export default Map3D;

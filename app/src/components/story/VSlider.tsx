import { useState } from 'react';
import { View } from 'react-native';

/** Instagram's thin vertical size slider (wide at the top). value 0..1, top = 1. */
export function VSlider({ value, onChange, height = 220 }: { value: number; onChange: (v: number) => void; height?: number }) {
  const [h, setH] = useState(height);
  const v = Math.min(1, Math.max(0, value));
  const set = (y: number) => onChange(Math.min(1, Math.max(0, 1 - y / (h || 1))));
  return (
    <View accessibilityRole="adjustable" accessibilityLabel="size" style={{ width: 44, height, alignItems: 'center', justifyContent: 'center', direction: 'ltr' }}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationY)} onResponderMove={(e) => set(e.nativeEvent.locationY)}>
      {/* a tapering track */}
      <View pointerEvents="none" style={{ width: 0, height, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: height, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(255,255,255,0.55)', position: 'absolute' }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: (1 - v) * height - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4 }} />
    </View>
  );
}

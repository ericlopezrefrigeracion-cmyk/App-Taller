import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { strokesToPNG } from '../lib/signaturePng';

type Point = { x: number; y: number };

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

interface Props {
  onBegin?: () => void;
}

const SignaturePad = forwardRef<SignaturePadRef, Props>(({ onBegin }, ref) => {
  const [renderStrokes, setRenderStrokes] = useState<Point[][]>([]);
  const strokesRef = useRef<Point[][]>([]);
  const activeRef  = useRef<Point[]>([]);
  const emptyRef   = useRef(true);
  const sizeRef    = useRef({ w: 0, h: 0 });

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokesRef.current = [];
      activeRef.current  = [];
      emptyRef.current   = true;
      setRenderStrokes([]);
    },
    isEmpty: () => emptyRef.current,
    toDataURL: () => strokesToPNG(strokesRef.current, sizeRef.current.w, sizeRef.current.h),
  }));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        activeRef.current = [{ x, y }];
        strokesRef.current = [...strokesRef.current, activeRef.current];
        setRenderStrokes([...strokesRef.current]);
        if (emptyRef.current) {
          emptyRef.current = false;
          onBegin?.();
        }
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        activeRef.current = [...activeRef.current, { x, y }];
        strokesRef.current = [...strokesRef.current.slice(0, -1), activeRef.current];
        setRenderStrokes([...strokesRef.current]);
      },
    })
  ).current;

  function toD(pts: Point[]): string {
    if (!pts.length) return '';
    return (
      `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}` +
      pts.slice(1).map((p) => ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        sizeRef.current = { w: width, h: height };
      }}
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {renderStrokes.map((pts, i) => (
          <Path
            key={i}
            d={toD(pts)}
            stroke="#111111"
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});

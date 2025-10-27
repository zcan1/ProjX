import * as ThreeModule from 'https://unpkg.com/three@0.160.0/build/three.module.js?module';

const OriginalQuaternionKeyframeTrack = ThreeModule.QuaternionKeyframeTrack;

class SafeQuaternionKeyframeTrack extends OriginalQuaternionKeyframeTrack {
  constructor(name, times, values, interpolation) {
    const sanitized = sanitizeQuaternionTrackInput(times, values);
    super(name, sanitized.times, sanitized.values, interpolation);
    if (sanitized.empty) {
      Object.defineProperty(this, '_projxEmptyTrack', {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
  }
}

Object.defineProperty(SafeQuaternionKeyframeTrack, '__projxSafeQuaternionPatch', {
  value: true,
  enumerable: false,
  configurable: false,
  writable: false,
});

Object.setPrototypeOf(SafeQuaternionKeyframeTrack, OriginalQuaternionKeyframeTrack);

function sanitizeQuaternionTrackInput(times, values) {
  const hasTimes = hasKeyframeData(times);
  const hasValues = hasKeyframeData(values);

  if (hasTimes && hasValues) {
    return { times, values, empty: false };
  }

  const TimeArray = getArrayConstructor(times);
  const ValueArray = getArrayConstructor(values);

  return {
    times: new TimeArray([0]),
    values: new ValueArray([0, 0, 0, 1]),
    empty: true,
  };
}

function hasKeyframeData(data) {
  if (!data) return false;
  if (Array.isArray(data)) {
    return data.length > 0;
  }
  if (ArrayBuffer.isView(data)) {
    return data.length > 0;
  }
  return false;
}

function getArrayConstructor(example) {
  if (ArrayBuffer.isView(example) && typeof example.constructor === 'function') {
    return example.constructor;
  }
  if (Array.isArray(example)) {
    return Float32Array;
  }
  return Float32Array;
}

const THREE = {
  ...ThreeModule,
  QuaternionKeyframeTrack: SafeQuaternionKeyframeTrack,
};

export * from 'https://unpkg.com/three@0.160.0/build/three.module.js?module';
export { SafeQuaternionKeyframeTrack as QuaternionKeyframeTrack };
export default THREE;

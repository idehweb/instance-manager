import { isAsyncFunction } from "util/types";

export function catchFn(fn, { self, onError }) {
  if (isAsyncFunction(fn)) {
    return async (...args) => {
      try {
        return await fn.call(self ?? this, ...args);
      } catch (err) {
        if (onError) {
          return onError.call(self ?? this, err, ...args);
        } else console.error("#CatchError", err);
      }
    };
  } else {
    return (...args) => {
      try {
        return fn.call(self ?? this, ...args);
      } catch (err) {
        if (onError) {
          return onError.call(self ?? this, err, ...args);
        } else console.error("#CatchError", err);
      }
    };
  }
}
export function catchMiddleware(fn, { self, onError } = {}) {
  return catchFn(fn, {
    self,
    onError:
      onError ??
      ((err, req, res, next) => {
        return next(err);
      }),
  });
}

export function classCatchBuilder(C, onError = C.onError) {
  const methodNames = Object.getOwnPropertyNames(C)
    .filter(
      (p) =>
        typeof C[p] === "function" && p !== "constructor" && p !== "onError"
    )
    .filter((n) => !n.startsWith("_"));

  methodNames.forEach(
    (mn) =>
      (C[mn] = catchMiddleware(C[mn], {
        self: C,
        onError: onError ? (...args) => onError(mn, ...args) : null,
      }))
  );
  return C;
}

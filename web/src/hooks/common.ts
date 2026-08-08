/**
 * Basic alias for a value which either is a default value, or is a
 * function that materializes a default value lazily. Mirros React
 * `setState` initializers.
 */
export type DefaultOrDefaultProvider<T> = T | (() => T);

export function getDefault<T>(from: DefaultOrDefaultProvider<T>) {
    // FIXME: this will break if `T` itself is a function type, since it will
    // call it. Nothing takes that path so I don't care right now, but still
    return typeof(from) === "function" 
        ? (from as (() => T))()
        : from;
}
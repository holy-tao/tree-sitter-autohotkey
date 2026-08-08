import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { decodeSource, encodeSource } from "../lib/urlState";
import { getDefault, type DefaultOrDefaultProvider } from "./common";

/**
 * Wrapper around `useState` that stores the value in the URL hash fragment, compressed. The
 * value must be a string or string extension (e.g. a string enum). Note that string enums
 * are allowed, but can't be validated at runtime.
 * 
 * @param key the key to read off in the hash
 * @param defaultValue the default value if one is not found.
 */
export default function useCompressedUrlHashState<T extends string>(
    key: string,
    defaultValue: DefaultOrDefaultProvider<T>,
    /** Default value in case of a decoding error (if unset, `defaultValue` is used) */
    errorValue?: DefaultOrDefaultProvider<T>
): [T, Dispatch<SetStateAction<T>>] {
    const read = useCallback((): T => {
        const params = new URLSearchParams(window.location.hash.slice(1));

        const encoded = params.get(key);
        if (encoded != null) {
            // FIXME: Technically unsound for enums, but I don't use any so I don't care
            const decoded = decodeSource(encoded);
            if(decoded != null) {
                return decoded as T;
            }
            else if (typeof(errorValue) !== "undefined") {
                return getDefault(errorValue);
            }
        }

        // Value not set -- return default
        return getDefault(defaultValue);
    }, [key, defaultValue]);

    const [value, setValue] = useState<T>(read);

    // Listen for URL changes and update the fragment if we detect any
    useEffect(() => {
        const onChange = () => setValue(read());
        window.addEventListener("hashchange", onChange);

        return () => window.removeEventListener("hashchange", onChange);
    }, [read]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (value) {
            const encoded = encodeSource(value);
            params.set(key, encoded);
        }
        else {
            params.delete(key);
        }

        const url = new URL(window.location.href);
        url.hash = params.toString();
        window.history.replaceState({}, "", url.toString());
    },
    [key, value])

    return [value, setValue];
}
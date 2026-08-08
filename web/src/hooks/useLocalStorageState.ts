import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { getDefault, type DefaultOrDefaultProvider } from "./common";

/**
 * A wrapper around React's `useState` that persists the value in
 * localStorage. Usage is identical to `useState`, except that a
 * lookup key must be provided.
 * @param initial The default value, if none has been persisted 
 */
export default function useLocalStorageState<T>(
    key: string, 
    defaultValue: DefaultOrDefaultProvider<T>
): [T, Dispatch<SetStateAction<T>>] {    
    const [value, setValue] = useState(() => {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : getDefault(defaultValue);
        } 
        catch (error) {
            console.error("Error reading localStorage key:", key, error);
            return getDefault(defaultValue);
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        }
        catch (error) {
            console.error("Error setting localStorage key:", key, error);
        }
    }, [key, value]);

    return [value, setValue];
}
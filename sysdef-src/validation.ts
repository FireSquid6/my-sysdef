// object validation code since we don't want any external dependencies

export namespace v {
  export type Validator<T> = (o: unknown) => o is T;
  export type Infer<K> = K extends Validator<infer T> ? T : never;

  export const bool: () => Validator<boolean> = () => (o: unknown) => typeof o === "boolean";
  export const number: () => Validator<number> = () => (o: unknown) => typeof o === "number"
  export const string: () => Validator<string> = () => (o: unknown) => typeof o === "string";
  export const unknown: () => Validator<unknown> = () => (o: unknown): o is unknown => true;

  export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
    return (o: unknown) => validator(o) || o === undefined;
  }
  export function nullable<T>(validator: Validator<T>): Validator<T | null> {
    return (o: unknown) => validator(o) || o === null;
  }

  export function union<T extends readonly Validator<any>[]>(...validators: T): Validator<Infer<T[number]>> {
    return (o: unknown): o is Infer<T[number]> => {
      return validators.some(validator => validator(o));
    };
  }

  export function literal<T extends string | number | boolean | null | undefined>(value: T): Validator<T> {
    return (o: unknown): o is T => o === value;
  }

  export function obj<T extends Record<string, Validator<any>>>(obj: T): Validator<{ [K in keyof T]: Infer<T[K]> }> {
    return (o: unknown): o is { [K in keyof T]: Infer<T[K]> } => {
      if (typeof o !== "object" || o === null || o === undefined) {
        return false;
      }
      
      const target = o as Record<string, unknown>;

      for (const key of Object.keys(obj)) {
        const validator = obj[key]!;
        const valid = validator(target[key]);
        if (!valid) {
          return false;
        }
      }

      return true;
    }
  }

  export function parse<T>(object: unknown, validator: Validator<T>): T {
    const valid = validator(object);

    if (!valid) {
      throw new Error("Validation failed!");
    }

    return object;
  }

  export function parseSafe<T>(object: unknown, validator: Validator<T>): T | null {
    const valid = validator(object);

    if (!valid) {
      return null;
    }

    return object;
  }

  export function array<T>(elementValidator: Validator<T>): Validator<T[]> {
    return (o: unknown): o is T[] => {
      if (!Array.isArray(o)) {
        return false;
      }
      return o.every(element => elementValidator(element));
    };
  }

  export function record<K extends string | number | symbol, V>(
    keyValidator: Validator<K>,
    valueValidator: Validator<V>
  ): Validator<Record<K, V>> {
    return (o: unknown): o is Record<K, V> => {
      if (typeof o !== "object" || o === null || o === undefined) {
        return false;
      }
      
      const target = o as Record<string | number | symbol, unknown>;
      
      for (const [key, value] of Object.entries(target)) {
        if (!keyValidator(key) || !valueValidator(value)) {
          return false;
        }
      }
      
      return true;
    };
  }
}


import React from 'react';

/**
 * Custom Hooks personalizados
 */

/**
 * Hook para usar formularios
 */
export const useForm = (initialValues: any, onSubmit: (values: any) => Promise<void>) => {
  const [values, setValues] = React.useState(initialValues);
  const [errors, setErrors] = React.useState<any>({});
  const [loading, setLoading] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setValues((prev: any) => ({ ...prev, [name]: value }));
    // Limpiar error del campo
    if (errors[name]) {
      setErrors((prev: any) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(values);
    } catch (error: any) {
      setErrors({ submit: error.message });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
  };

  return {
    values,
    errors,
    loading,
    handleChange,
    handleSubmit,
    reset,
    setValues,
    setErrors,
  };
};

/**
 * Hook para fetch de datos
 */
interface UseFetchOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  immediate?: boolean;
}

export const useFetch = (
  url: string,
  options: UseFetchOptions = {}
) => {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<any>(null);

  const executeFetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.fetch(url);
      const result = await response.json();
      setData(result);
      options.onSuccess?.(result);
    } catch (err) {
      setError(err);
      options.onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  React.useEffect(() => {
    if (options.immediate !== false) {
      executeFetch();
    }
  }, [executeFetch, options.immediate]);

  return { data, loading, error, refetch: executeFetch };
};

/**
 * Hook para debounce
 */
export const useDebounce = (value: string, delay: number = 500) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook para localStorage
 */
export const useLocalStorage = (key: string, initialValue: any) => {
  const [storedValue, setStoredValue] = React.useState(() => {
    try {
      const item = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: any) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

/**
 * Hook para async operation
 */
export const useAsync = (asyncFunction: () => Promise<any>, immediate = true) => {
  const [status, setStatus] = React.useState('idle');
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<any>(null);

  const execute = React.useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);
    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      return response;
    } catch (error) {
      setError(error);
      setStatus('error');
      throw error;
    }
  }, [asyncFunction]);

  React.useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { execute, status, data, error };
};

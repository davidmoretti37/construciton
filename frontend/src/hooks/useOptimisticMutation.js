import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Optimistic mutation hook — updates UI instantly, syncs to server in background.
 * On failure, rolls back the UI and optionally shows an error alert.
 *
 * @param {Object} options
 * @param {Function} options.mutationFn - Async function that performs the server mutation. Receives (args).
 * @param {Function} options.onMutate - Called BEFORE the server request. Receives (args).
 *   Should return a rollback function: () => void (restores previous state).
 * @param {Function} [options.onSuccess] - Called after server confirms success. Receives (result, args).
 * @param {Function} [options.onError] - Called on failure. Receives (error, args). Default: shows Alert.
 * @param {Function} [options.onSettled] - Called after success or failure. Receives (result, error, args).
 * @param {string} [options.errorMessage] - Custom error alert message.
 * @returns {{ mutate: Function, mutateAsync: Function, isLoading: boolean }}
 */
export function useOptimisticMutation(options) {
  const {
    mutationFn,
    onMutate,
    onSuccess,
    onError,
    onSettled,
    errorMessage = 'Something went wrong. Please try again.',
  } = options;

  const inflightRef = useRef(0);

  const mutateAsync = useCallback(async (args) => {
    // 1. Optimistic update — get rollback handle
    let rollback;
    try {
      rollback = onMutate ? onMutate(args) : null;
    } catch (e) {
      // If onMutate itself fails, abort
      throw e;
    }

    inflightRef.current++;

    try {
      // 2. Fire the actual server request
      const result = await mutationFn(args);

      // 3. Success callback
      if (onSuccess) onSuccess(result, args);
      return result;
    } catch (error) {
      // 4. Rollback optimistic state
      if (typeof rollback === 'function') rollback();

      // 5. Error handling
      if (onError) {
        onError(error, args);
      } else {
        Alert.alert('Error', errorMessage);
      }
      throw error;
    } finally {
      inflightRef.current--;
      if (onSettled) onSettled(args);
    }
  }, [mutationFn, onMutate, onSuccess, onError, onSettled, errorMessage]);

  const mutate = useCallback((args) => {
    mutateAsync(args).catch(() => {}); // Fire-and-forget (errors handled internally)
  }, [mutateAsync]);

  return { mutate, mutateAsync };
}

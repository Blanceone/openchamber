/**
 * Ambiguous transport failures.
 *
 * When a request dies after it was already handed to the transport, the client
 * knows the response was lost — it does NOT know whether the server processed
 * the request. Callers must tell that state apart from a definite failure;
 * transports tag these errors, and callers read the tag.
 */

const AMBIGUOUS_TRANSPORT_FLAG = '__openchamberAmbiguousTransport';

export const markAmbiguousTransportFailure = <T extends Error>(error: T): T => {
  Object.defineProperty(error, AMBIGUOUS_TRANSPORT_FLAG, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return error;
};

export const isAmbiguousTransportFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)[AMBIGUOUS_TRANSPORT_FLAG] === true;
};

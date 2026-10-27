// Local stand-in for https://deno.land/std@0.208.0/http/server.ts where deno.land is unreachable: the same `serve`, over Deno.serve.
export const serve = (handler: (req: Request) => Response | Promise<Response>, options: Record<string, unknown> = {}) =>
  (Deno as unknown as { serve: (o: unknown, h: unknown) => unknown }).serve(options, handler);

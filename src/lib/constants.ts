/**
 * Shared by the browser and the server, so it must stay free of server-only imports:
 * anything the tRPC provider imports ends up in the client bundle.
 */
export const DEMO_USER_HEADER = "x-demo-user";

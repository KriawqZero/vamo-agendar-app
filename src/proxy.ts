import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  // Landings verticais por nicho (SSG, sem sessão)
  "/para(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Fluxo B2C de Fricção Zero: cliente final agenda sem login
  "/book(.*)",
  // Webhooks de terceiros (QStash) chegam sem sessão Clerk
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};

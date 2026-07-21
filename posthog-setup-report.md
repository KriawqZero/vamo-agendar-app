# PostHog post-wizard report

The wizard completed the PostHog integration for this Next.js App Router project. Client analytics now initializes before hydration in `instrumentation-client.ts`, server events use `posthog-node` with immediate flushing in short-lived Next.js requests, and the existing pseudonymous tenant identity contract remains in place. The project now captures public booking conversion, tenant activation, dashboard booking operations, WhatsApp connection, and reminder reliability without placing customer PII in event properties. Environment variables were written to `.env.local`, and a scoped ESLint check plus a full production build passed.

| Event | Description | File |
|---|---|---|
| `signup_completed` | A newly created authenticated account reached the dashboard. | `src/components/analytics/IdentificacaoAnalytics.tsx` |
| `schedule_configured` | A tenant saved its first weekly availability configuration. | `src/app/actions/agenda.ts` |
| `first_service_created` | A tenant created its first bookable service. | `src/app/actions/servicos.ts` |
| `booking_started` | A visitor selected a service and entered the public booking funnel. | `src/app/book/[slug]/BookingApp.tsx` |
| `booking_completed` | A public booking was successfully persisted. | `src/app/actions/public-booking.ts` |
| `booking_failed` | A public booking failed because its slot became unavailable or persistence failed. | `src/app/actions/public-booking.ts` |
| `manual_booking_created` | A professional successfully created a booking from the dashboard. | `src/app/actions/agendamentos.ts` |
| `booking_status_changed` | A professional changed a booking status. | `src/app/actions/agendamentos.ts` |
| `booking_rescheduled` | A professional successfully moved a booking to another slot. | `src/app/actions/agendamentos.ts` |
| `whatsapp_connect_started` | A professional started the WhatsApp connection flow. | `src/app/dashboard/whatsapp/WhatsappClient.tsx` |
| `whatsapp_connected` | The WhatsApp integration reached the connected state. | `src/app/dashboard/whatsapp/WhatsappClient.tsx` |
| `whatsapp_reminder_sent` | The reminder webhook successfully sent a WhatsApp reminder. | `src/app/api/webhooks/lembrete/route.ts` |
| `whatsapp_reminder_failed` | The reminder webhook failed to send a WhatsApp reminder. | `src/app/api/webhooks/lembrete/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/522821/dashboard/1885203)
- [Public booking conversion](https://us.posthog.com/project/522821/insights/MM2TskS1)
- [Tenant activation funnel](https://us.posthog.com/project/522821/insights/o9jUIX6F)
- [Booking outcomes](https://us.posthog.com/project/522821/insights/1betnNDT)
- [Booking status changes](https://us.posthog.com/project/522821/insights/gNZE0btH)
- [WhatsApp reminder reliability](https://us.posthog.com/project/522821/insights/b2MihIIn)

## Verify before merging

- [ ] Run a full production build and fix any lint or type errors introduced by generated code. The wizard build passed, but CI may use additional checks.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or the bundler upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor dashboard path continues to call `identify` and links events to the pseudonymous tenant identity.
- [ ] Confirm Supabase, Clerk, Resend, and Sentry data sources were found; run `npx @posthog/wizard warehouse` to connect them to PostHog's data warehouse.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

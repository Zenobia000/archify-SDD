# ADR-0001: Deliver reminders through a transactional outbox {#adr-reminder-delivery}

Booking API writes each appointment event to an **outbox table in the same transaction** as the appointment. An Outbox Publisher relays it to the Event Bus, and the Reminder Worker sends the reminders.

- A confirmed appointment and its event commit together, so no reminder is lost when the Event Bus or Messaging Provider is down.
- The booking request no longer waits for SMS or LINE delivery.
- The Reminder Worker owns the 24 h and 2 h schedule and its retries, apart from the Booking API.

@answer scope="CareSlot (fictional) · reminders for confirmed appointments · Status: Accepted"
@meta locale=en

## What problem does this decision solve? {#context}

A visit is confirmed only after the deposit succeeds. Reminders must then go out 24 h and 2 h before the visit, by SMS or LINE. A confirmed visit is also pushed to the Clinic EMR.

The confirmation runs inside a Payment Provider webhook. That handler must answer fast and must not depend on a third service being up. The Messaging Provider can be slow or unavailable for minutes at a time.

@callout level=warning title="The failure we must avoid"
| The appointment commits as confirmed, but the reminder request is never sent. |
| The patient then misses the visit and forfeits the deposit through no fault of their own. |

## Which options did we consider? {#options}

| Criterion | Direct call to Messaging Provider | Cron job polls Booking DB | Transactional outbox + Event Bus |
| --- | --- | --- | --- |
| Event lost if a dependency is down | Yes, after commit {bad:Lossy} | No | No {good:Durable} |
| Webhook latency | Waits for SMS or LINE delivery {bad:Slow} | Unaffected | One extra row insert |
| Reminder delay | Immediate | Up to one polling interval {caution:Delayed} | Seconds |
| Other consumers, such as the EMR push | Each needs its own call | Each needs its own query | Subscribe to the same event {good:Reusable} |
| Coupling to the booking schema | None | Reminder job reads booking tables {caution:Tight} | Only the outbox row format |
| New moving parts | None | One scheduler | Publisher and Event Bus {caution:More to run} |

## What did we decide? {#decision}

@architecture id=outbox-path title="Reminder delivery through the outbox"
| booking-api | Booking API | backend |
| booking-db | Booking DB | database |
| outbox-publisher | Outbox Publisher | backend |
| event-bus | Event Bus | messagebus |
| reminder-worker | Reminder Worker | backend |
| messaging-provider | Messaging Provider | external |
| booking-api > booking-db | one transaction | emphasis |
| booking-db > outbox-publisher | unpublished rows | dashed |
| outbox-publisher > event-bus | AMQP | dashed |
| event-bus > reminder-worker | appointment.confirmed | dashed |
| reminder-worker > messaging-provider | SMS, LINE | emphasis |

@steps id=decision-steps
| commit | Booking API | Writes the confirmed appointment and an `appointment.confirmed` outbox row in one transaction. | outbox-path | booking-api |
| relay | Outbox Publisher | Reads unpublished rows, publishes them, then marks them published. | outbox-path | outbox-publisher |
| route | Event Bus | Delivers the event to every subscriber, including the Reminder Worker. | outbox-path | event-bus |
| send | Reminder Worker | Schedules the 24 h and 2 h reminders and sends them through the Messaging Provider. | outbox-path | reminder-worker |

## What follows from this decision? {#consequences}

| Consequence | Effect |
| --- | --- |
| No confirmed appointment can exist without its event | {good:Positive} |
| The webhook answers without waiting for message delivery | {good:Positive} |
| The EMR push and later consumers reuse the same event | {good:Positive} |
| Delivery is at least once, so the Reminder Worker must ignore duplicate events by event id | {caution:Negative} |
| The team runs and monitors an Outbox Publisher and a RabbitMQ Event Bus | {caution:Negative} |
| Old outbox rows need a cleanup job | {caution:Negative} |

## What is the status of this record? {#status}

@facts
| Status | Accepted |
| Owner | Booking team |
| Affects | Booking API, Event Bus, Reminder Worker, Booking DB |
| Revisit if | The Event Bus is replaced, or reminders need exactly-once delivery |

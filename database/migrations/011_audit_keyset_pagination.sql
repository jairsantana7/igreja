SET LOCAL ROLE igreja_owner;

CREATE INDEX audit_events_tenant_action_created_idx
  ON public.audit_events (tenant_id, action, created_at DESC, id DESC);

CREATE INDEX audit_events_tenant_event_created_idx
  ON public.audit_events (tenant_id, (metadata ->> 'eventId'), created_at DESC, id DESC)
  WHERE metadata ? 'eventId';

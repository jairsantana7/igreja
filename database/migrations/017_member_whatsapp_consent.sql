SET LOCAL ROLE igreja_owner;

ALTER TABLE public.member_profiles
  ADD COLUMN whatsapp_communication_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_communication_opted_in_at timestamptz,
  ADD COLUMN whatsapp_communication_opted_out_at timestamptz,
  ADD CONSTRAINT member_profiles_whatsapp_consent_phone_check CHECK (
    NOT whatsapp_communication_opt_in OR phone IS NOT NULL
  ),
  ADD CONSTRAINT member_profiles_whatsapp_consent_date_check CHECK (
    NOT whatsapp_communication_opt_in OR whatsapp_communication_opted_in_at IS NOT NULL
  );

COMMENT ON COLUMN public.member_profiles.whatsapp_communication_opt_in IS
  'Autorização explícita do membro para conversa individual iniciada pela comunidade.';
COMMENT ON COLUMN public.member_profiles.whatsapp_communication_opted_in_at IS
  'Instante da concessão atual ou mais recente da autorização individual.';
COMMENT ON COLUMN public.member_profiles.whatsapp_communication_opted_out_at IS
  'Instante da última revogação de uma autorização anteriormente ativa.';

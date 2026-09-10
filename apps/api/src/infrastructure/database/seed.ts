import { hash } from 'bcryptjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { env } from '../config/env';
import { SharpGalleryImageProcessor } from '../media/sharp-gallery-image.processor';

const ids = {
  tenant: '00000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  adminRole: '20000000-0000-4000-8000-000000000001',
  pastorRole: '20000000-0000-4000-8000-000000000002',
  memberRole: '20000000-0000-4000-8000-000000000003',
  event: '30000000-0000-4000-8000-000000000001',
  eventPublic: '40000000-0000-4000-8000-000000000001',
  field: '50000000-0000-4000-8000-000000000001',
  reminderTemplate: '60000000-0000-4000-8000-000000000001',
  reminderTemplateVersion: '61000000-0000-4000-8000-000000000001',
  cancellationTemplate: '60000000-0000-4000-8000-000000000002',
  cancellationTemplateVersion: '61000000-0000-4000-8000-000000000002',
  conversationChannel: '62000000-0000-4000-8000-000000000001',
  eventReminder: '63000000-0000-4000-8000-000000000001',
  pastEvent: '30000000-0000-4000-8000-000000000002',
  pastEventPublic: '40000000-0000-4000-8000-000000000002',
  gallery: '64000000-0000-4000-8000-000000000001',
  galleryPublic: '65000000-0000-4000-8000-000000000001',
  pixIntegration: '69000000-0000-4000-8000-000000000001',
  eventOffering: '6a000000-0000-4000-8000-000000000001',
  memberProfile: '6b000000-0000-4000-8000-000000000001',
  memberChildOne: '6c000000-0000-4000-8000-000000000001',
  memberChildTwo: '6c000000-0000-4000-8000-000000000002',
};

const galleryAssetsPath = resolve(__dirname, '../../../../../database/seed-assets/gallery-demo');
const demoGalleryPhotos = [
  {
    id: '66000000-0000-4000-8000-000000000001',
    displayId: '67000000-0000-4000-8000-000000000001',
    thumbnailId: '68000000-0000-4000-8000-000000000001',
    fileName: 'confraternizacao.png',
    caption: 'Conversas que continuaram depois do encontro.',
    altText: 'Pessoas conversando em pequenos grupos em um salão iluminado.',
  },
  {
    id: '66000000-0000-4000-8000-000000000002',
    displayId: '67000000-0000-4000-8000-000000000002',
    thumbnailId: '68000000-0000-4000-8000-000000000002',
    fileName: 'cafe-comunitario.png',
    caption: 'O café preparado com carinho pelos voluntários.',
    altText: 'Voluntários servindo café, pães e frutas em uma mesa comunitária.',
  },
  {
    id: '66000000-0000-4000-8000-000000000003',
    displayId: '67000000-0000-4000-8000-000000000003',
    thumbnailId: '68000000-0000-4000-8000-000000000003',
    fileName: 'momento-musical.png',
    caption: 'Um momento de música vivido por toda a comunidade.',
    altText: 'Comunidade vista de costas acompanhando uma apresentação musical acústica.',
  },
].map((photo) => ({
  ...photo,
  originalStorageKey: `${photo.id}.png`,
  displayStorageKey: `${photo.displayId}.webp`,
  thumbnailStorageKey: `${photo.thumbnailId}.webp`,
}));

async function prepareDemoGalleryMedia(): Promise<void> {
  const processor = new SharpGalleryImageProcessor();
  await mkdir(env.mediaStoragePath, { recursive: true });
  for (const photo of demoGalleryPhotos) {
    const source = await readFile(join(galleryAssetsPath, photo.fileName));
    const processed = await processor.process(source);
    await Promise.all([
      writeFile(join(env.mediaStoragePath, photo.originalStorageKey), source),
      writeFile(join(env.mediaStoragePath, photo.displayStorageKey), processed.display.content),
      writeFile(join(env.mediaStoragePath, photo.thumbnailStorageKey), processed.thumbnail.content),
    ]);
  }
}

async function seed(): Promise<void> {
  if (!env.migrationUrl) throw new Error('DATABASE_MIGRATION_URL é obrigatória para o seed.');
  await prepareDemoGalleryMedia();
  const pool = new Pool({ connectionString: env.migrationUrl, application_name: 'igreja-seed' });
  const client = await pool.connect();
  try {
    const adminPasswordHash = await hash('Comunidade#2026', 12);
    const memberPasswordHash = await hash('Membro#2026', 12);
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE igreja_owner');
    await client.query(`
      INSERT INTO tenant_directory (tenant_id, slug) VALUES ($1, 'comunidade-demo')
      ON CONFLICT (tenant_id) DO UPDATE SET slug = EXCLUDED.slug
    `, [ids.tenant]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [ids.tenant]);
    await client.query(`
      INSERT INTO tenants (id, name) VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    `, [ids.tenant, env.appName]);
    await client.query(`
      INSERT INTO users (id, tenant_id, name, email, password_hash)
      VALUES ($1, $2, 'Admin Inicial', 'admin@comunidade.local', $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, updated_at = now()
    `, [ids.admin, ids.tenant, adminPasswordHash]);
    await client.query(`
      INSERT INTO users (id, tenant_id, name, email, password_hash)
      VALUES ($1, $2, 'Membro Demonstração', 'membro@comunidade.local', $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash, updated_at = now()
    `, [ids.member, ids.tenant, memberPasswordHash]);
    await client.query(`
      INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES
        ($1, $4, 'admin', 'Administrador', true),
        ($2, $4, 'pastor', 'Pastor', true),
        ($3, $4, 'member', 'Membro', true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [ids.adminRole, ids.pastorRole, ids.memberRole, ids.tenant]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      SELECT $1, $2, key FROM permissions
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.adminRole]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      SELECT $1, $2, key FROM permissions
      WHERE (
          key LIKE 'events.%'
          AND key NOT IN ('events.read_all', 'events.manage_all')
        )
        OR key LIKE 'settings.%'
        OR (
          key LIKE 'galleries.%'
          AND key <> 'galleries.read_all'
        )
        OR key IN (
          'conversations.read', 'conversations.reply', 'conversations.assign',
          'channels.manage_own', 'members.profile_read', 'members.profile_manage',
          'whatsapp.templates_read', 'whatsapp.templates_sync',
          'communications.templates_read', 'communications.templates_manage',
          'events.reminders_manage'
        )
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.pastorRole]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      VALUES ($1, $2, 'events.register'), ($1, $2, 'sessions.manage'), ($1, $2, 'galleries.view')
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.memberRole]);
    await client.query(`
      INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES
        ($1, $2, $3),
        ($1, $4, $5)
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.admin, ids.adminRole, ids.member, ids.memberRole]);
    const pixIntegration = await client.query<{ id: string }>(`
      INSERT INTO community_integrations (
        id, tenant_id, category, provider_key, enabled, configuration
      ) VALUES ($1, $2, 'payment', 'pix_manual', true, $3::jsonb)
      ON CONFLICT (tenant_id, category, provider_key) DO UPDATE SET
        enabled = EXCLUDED.enabled, configuration = EXCLUDED.configuration, updated_at = now()
      RETURNING id
    `, [ids.pixIntegration, ids.tenant, JSON.stringify({
      keyType: 'email',
      key: 'recebimentos@example.test',
      recipientName: 'Comunidade Demonstração',
      city: 'Santos',
    })]);
    await client.query(`
      INSERT INTO member_profiles (
        id, tenant_id, user_id, phone, birth_date, spouse_name, marriage_date,
        postal_code, street, address_number, neighborhood, city, state,
        whatsapp_communication_opt_in, whatsapp_communication_opted_in_at, updated_by_user_id
      ) VALUES (
        $1, $2, $3, '+5513999990002', DATE '1988-04-12', 'Alex Demonstração', DATE '2014-06-21',
        '11000-000', 'Rua da Comunidade', '100', 'Centro', 'Santos', 'SP', true, now(), $3
      )
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET
        phone = EXCLUDED.phone, birth_date = EXCLUDED.birth_date, spouse_name = EXCLUDED.spouse_name,
        marriage_date = EXCLUDED.marriage_date, postal_code = EXCLUDED.postal_code,
        street = EXCLUDED.street, address_number = EXCLUDED.address_number,
        neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city, state = EXCLUDED.state,
        whatsapp_communication_opt_in = true,
        whatsapp_communication_opted_in_at = COALESCE(member_profiles.whatsapp_communication_opted_in_at, now()),
        updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
    `, [ids.memberProfile, ids.tenant, ids.member]);
    const memberProfile = await client.query<{ id: string }>(
      'SELECT id FROM member_profiles WHERE user_id = $1',
      [ids.member],
    );
    await client.query(`
      INSERT INTO member_children (id, tenant_id, profile_id, member_user_id, name, birth_date) VALUES
        ($1, $3, $4, $5, 'Clara Demonstração', DATE '2017-02-10'),
        ($2, $3, $4, $5, 'Pedro Demonstração', DATE '2020-09-05')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, birth_date = EXCLUDED.birth_date
    `, [ids.memberChildOne, ids.memberChildTwo, ids.tenant, memberProfile.rows[0]!.id, ids.member]);
    await client.query(`
      INSERT INTO events (
        id, tenant_id, created_by_user_id, public_id, slug, title, description,
        location, starts_at, registration_deadline, capacity, pix_integration_id,
        family_registration_enabled, status
      ) VALUES (
        $1, $2, $3, $4, 'encontro-de-boas-vindas', 'Encontro de boas-vindas',
        'Um tempo para conhecer pessoas, compartilhar histórias e caminhar em comunidade.',
        'Salão principal', now() + interval '14 days', now() + interval '12 days', 120, $5, true, 'published'
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status,
        pix_integration_id = EXCLUDED.pix_integration_id,
        family_registration_enabled = EXCLUDED.family_registration_enabled, updated_at = now()
    `, [ids.event, ids.tenant, ids.admin, ids.eventPublic, pixIntegration.rows[0]!.id]);
    await client.query(`
      INSERT INTO event_public_directory (public_id, tenant_id, event_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (public_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, event_id = EXCLUDED.event_id
    `, [ids.eventPublic, ids.tenant, ids.event]);
    await client.query(`
      INSERT INTO events (
        id, tenant_id, created_by_user_id, public_id, slug, title, description,
        location, starts_at, registration_deadline, capacity, status
      ) VALUES (
        $1, $2, $3, $4, 'domingo-em-comunidade', 'Domingo em comunidade',
        'Uma manhã de música, conversa e café compartilhado que aproximou ainda mais a nossa comunidade.',
        'Salão principal', now() - interval '30 days', now() - interval '32 days', 180, 'completed'
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
        location = EXCLUDED.location, starts_at = EXCLUDED.starts_at,
        registration_deadline = EXCLUDED.registration_deadline, capacity = EXCLUDED.capacity,
        status = EXCLUDED.status, updated_at = now()
    `, [ids.pastEvent, ids.tenant, ids.admin, ids.pastEventPublic]);
    await client.query(`
      INSERT INTO event_public_directory (public_id, tenant_id, event_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (public_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, event_id = EXCLUDED.event_id
    `, [ids.pastEventPublic, ids.tenant, ids.pastEvent]);
    await client.query(`
      INSERT INTO event_galleries (
        id, tenant_id, event_id, public_id, created_by_user_id, title, description,
        visibility, status, published_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'Um domingo para recordar',
        'Reunimos algumas lembranças da manhã em que celebramos, conversamos e cuidamos uns dos outros.',
        'public', 'published', now() - interval '29 days'
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
        visibility = EXCLUDED.visibility, status = EXCLUDED.status,
        published_at = EXCLUDED.published_at, updated_at = now()
    `, [ids.gallery, ids.tenant, ids.pastEvent, ids.galleryPublic, ids.admin]);
    await client.query(`
      INSERT INTO gallery_public_directory (public_id, tenant_id, gallery_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (public_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, gallery_id = EXCLUDED.gallery_id
    `, [ids.galleryPublic, ids.tenant, ids.gallery]);
    await client.query(`
      UPDATE gallery_photos SET position = position + 1000, is_cover = false
      WHERE gallery_id = $1 AND id = ANY($2::uuid[])
    `, [ids.gallery, demoGalleryPhotos.map((photo) => photo.id)]);
    for (const [position, photo] of demoGalleryPhotos.entries()) {
      await client.query(`
        INSERT INTO gallery_photos (
          id, tenant_id, gallery_id, uploaded_by_user_id, original_storage_key,
          display_storage_key, thumbnail_storage_key, mime_type, processing_status,
          caption, alt_text, position, is_cover
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'image/png', 'ready', $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET original_storage_key = EXCLUDED.original_storage_key,
          display_storage_key = EXCLUDED.display_storage_key,
          thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
          mime_type = EXCLUDED.mime_type, processing_status = EXCLUDED.processing_status,
          caption = EXCLUDED.caption, alt_text = EXCLUDED.alt_text,
          position = EXCLUDED.position, is_cover = EXCLUDED.is_cover, updated_at = now()
      `, [
        photo.id,
        ids.tenant,
        ids.gallery,
        ids.admin,
        photo.originalStorageKey,
        photo.displayStorageKey,
        photo.thumbnailStorageKey,
        photo.caption,
        photo.altText,
        position,
        position === 0,
      ]);
    }
    await client.query(`
      UPDATE events SET linked_gallery_id = $2, updated_at = now()
      WHERE id = $1
    `, [ids.event, ids.gallery]);
    await client.query(`
      INSERT INTO event_form_fields (id, tenant_id, event_id, field_key, label, type, required, options, position)
      VALUES ($1, $2, $3, 'restricao_alimentar', 'Possui alguma restrição alimentar?', 'short_text', false, '[]', 0)
      ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
    `, [ids.field, ids.tenant, ids.event]);
    await client.query(`
      INSERT INTO event_form_versions (tenant_id, event_id, version, schema_snapshot, created_by_user_id)
      VALUES ($1, $2, 1, $3::jsonb, $4)
      ON CONFLICT (event_id, tenant_id, version) DO NOTHING
    `, [ids.tenant, ids.event, JSON.stringify([{
      id: ids.field,
      key: 'restricao_alimentar',
      label: 'Possui alguma restrição alimentar?',
      type: 'short_text',
      required: false,
      options: [],
    }]), ids.admin]);
    await client.query(`
      INSERT INTO event_offerings (
        id, tenant_id, event_id, offering_key, name, description, price_cents, active, position
      ) VALUES ($1, $2, $3, 'cafe_da_manha', 'Café da manhã', 'Café preparado pela comunidade antes do encontro.', 2500, true, 0)
      ON CONFLICT (event_id, offering_key) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
        active = true, position = EXCLUDED.position, updated_at = now()
    `, [ids.eventOffering, ids.tenant, ids.event]);
    await client.query(`
      INSERT INTO communication_templates (id, tenant_id, created_by_user_id, name, purpose, channel, status) VALUES
        ($1, $3, $4, 'Lembrete do evento', 'event_reminder', 'whatsapp', 'active'),
        ($2, $3, $4, 'Aviso de cancelamento', 'event_cancellation', 'whatsapp', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, purpose = EXCLUDED.purpose,
        channel = EXCLUDED.channel, status = EXCLUDED.status, updated_at = now()
    `, [ids.reminderTemplate, ids.cancellationTemplate, ids.tenant, ids.admin]);
    await client.query(`
      INSERT INTO communication_template_versions (
        id, tenant_id, template_id, version, subject, body, variables, created_by_user_id
      ) VALUES
        ($1, $5, $2, 1, '', 'Olá, {{membro.nome}}! Lembramos que {{evento.nome}} será em {{evento.data}}, no local {{evento.local}}.',
          '["membro.nome", "evento.nome", "evento.data", "evento.local"]', $6),
        ($3, $5, $4, 1, '', 'Olá, {{membro.nome}}. O evento {{evento.nome}} foi cancelado. Acompanhe a comunidade para novas informações.',
          '["membro.nome", "evento.nome"]', $6)
      ON CONFLICT (id) DO NOTHING
    `, [ids.reminderTemplateVersion, ids.reminderTemplate, ids.cancellationTemplateVersion, ids.cancellationTemplate, ids.tenant, ids.admin]);
    await client.query(`
      INSERT INTO conversation_channels (
        id, tenant_id, owner_user_id, provider_key, display_name, phone_number, status
      ) VALUES ($1, $2, $3, 'manual', 'WhatsApp pastoral de demonstração', '+5511999999999', 'configured')
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, owner_user_id = EXCLUDED.owner_user_id
    `, [ids.conversationChannel, ids.tenant, ids.admin]);
    await client.query(`
      INSERT INTO event_reminder_rules (
        id, tenant_id, event_id, template_id, template_version_id, channel_id,
        created_by_user_id, audience, offset_minutes_before, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 1440, false)
      ON CONFLICT (id) DO NOTHING
    `, [ids.eventReminder, ids.tenant, ids.event, ids.reminderTemplate, ids.reminderTemplateVersion, ids.conversationChannel, ids.admin]);
    await client.query('COMMIT');
    process.stdout.write('Seed local concluído.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void seed();

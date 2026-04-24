// Best-effort audit logger for picture lifecycle actions.
// Never throws — failures are logged so the parent operation still succeeds.

export const PictureAuditAction = Object.freeze({
  ARCHIVED: 'ARCHIVED',
  RESTORED: 'RESTORED',
  DELETED: 'DELETED',
  EXCLUDED_ON_APPROVE: 'EXCLUDED_ON_APPROVE',
  SPLIT_INTO_NEW_SET: 'SPLIT_INTO_NEW_SET',
  SET_DELETED_ON_LAST_ARCHIVE: 'SET_DELETED_ON_LAST_ARCHIVE',
  SET_DELETED: 'SET_DELETED',
});

export async function logPictureAudit(client, entry) {
  try {
    await client.pictureAudit.create({
      data: {
        action: entry.action,
        pictureId: entry.pictureId ?? null,
        pictureSetId: entry.pictureSetId ?? null,
        uploaderId: entry.uploaderId ?? null,
        troupeId: entry.troupeId ?? null,
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        pictureSetStatusAtAction: entry.pictureSetStatusAtAction ?? null,
        filePath: entry.filePath ?? null,
        details: entry.details
          ? (typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details))
          : null,
      },
    });
  } catch (err) {
    console.error('Failed to write picture audit:', err?.message || err, { entry });
  }
}

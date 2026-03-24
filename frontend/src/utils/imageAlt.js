/**
 * Generate descriptive alt text for a picture, used for SEO and accessibility.
 * Shared between CategoryView thumbnails and ImagePreviewer.
 */
export function getImageAlt(picture, category) {
  const parts = [];

  if (picture.caption) {
    parts.push(picture.caption);
  } else if (category?.name) {
    parts.push(category.name);
  }

  if (picture.troupe?.group?.district?.name) parts.push(picture.troupe.group.district.name);
  if (picture.troupe?.group?.name) parts.push(picture.troupe.group.name);
  if (picture.troupe?.name) parts.push(picture.troupe.name);
  if (picture.patrouille?.name) parts.push(`Patrouille ${picture.patrouille.name}`);
  if (picture.pictureSet?.location) parts.push(picture.pictureSet.location);

  if (picture.type === 'SCHEMATIC') parts.push('Schema');
  else if (picture.type === 'INSTALLATION_PHOTO') parts.push("Photo d'installation");

  if (parts.length === 0) {
    return 'Installation scout - Scouts du Liban';
  }

  return `${parts.join(' - ')} - Scouts du Liban`;
}

/**
 * Build a SEO title for an individual photo page.
 */
export function buildPhotoTitle(picture, category) {
  const parts = [];
  if (category?.name) parts.push(category.name);
  if (picture.troupe?.group?.name) parts.push(picture.troupe.group.name);
  if (picture.troupe?.name) parts.push(picture.troupe.name);
  if (picture.pictureSet?.location) parts.push(picture.pictureSet.location);
  return parts.length > 0 ? parts.join(' - ') : 'Photo - Installations Scoutes';
}

/**
 * Build a SEO description for an individual photo page.
 */
export function buildPhotoDescription(picture, category) {
  const parts = [];

  if (picture.caption) parts.push(picture.caption);
  if (picture.pictureSet?.title) parts.push(picture.pictureSet.title);
  if (picture.pictureSet?.description) parts.push(picture.pictureSet.description);

  if (parts.length === 0) {
    const context = [];
    if (category?.name) context.push(category.name);
    if (picture.troupe?.group?.name) context.push(picture.troupe.group.name);
    if (picture.pictureSet?.location) context.push(picture.pictureSet.location);
    parts.push(`Photo d'installation scout${context.length ? ' - ' + context.join(', ') : ''}`);
  }

  parts.push('Scouts du Liban');
  return parts.join('. ');
}

/**
 * Build SEO keywords for an individual photo page.
 */
export function buildPhotoKeywords(picture, category) {
  const keywords = [];
  if (category?.name) keywords.push(category.name);
  if (picture.troupe?.group?.name) keywords.push(picture.troupe.group.name);
  if (picture.troupe?.name) keywords.push(picture.troupe.name);
  if (picture.pictureSet?.location) keywords.push(picture.pictureSet.location);
  if (picture.type === 'SCHEMATIC') keywords.push('schema', 'plan');
  else keywords.push('installation', 'photo');
  keywords.push('scout', 'camp');
  return keywords;
}

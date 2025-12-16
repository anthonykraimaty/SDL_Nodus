import { Helmet } from 'react-helmet-async';

const SEO = ({
  title,
  description,
  image,
  url,
  type = 'website',
  keywords = [],
  noIndex = false,
}) => {
  const siteName = 'Nodus - Scouts du Liban';
  const defaultDescription = 'Plateforme de partage de photos d\'installations scoutes. Parcourez et partagez des photos de camps, constructions et installations des Scouts du Liban.';
  const defaultImage = '/og-image.jpg';
  const baseUrl = 'https://nodus.scoutsduliban.org';

  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const fullDescription = description || defaultDescription;
  const fullImage = image ? (image.startsWith('http') ? image : `${baseUrl}${image}`) : `${baseUrl}${defaultImage}`;
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;

  const defaultKeywords = [
    'scouts du liban',
    'installations scoutes',
    'camp scout',
    'photos installations',
    'constructions scoutes',
    'pionnier',
    'froissartage',
    'nodus',
    'eclaireurs',
  ];

  const allKeywords = [...defaultKeywords, ...keywords].join(', ');

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      <meta name="keywords" content={allKeywords} />
      <link rel="canonical" href={fullUrl} />

      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:locale" content="fr_FR" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={fullImage} />

      {/* Additional SEO */}
      <meta name="author" content="Scouts du Liban" />
      <meta name="language" content="French" />
      <meta httpEquiv="content-language" content="fr" />
    </Helmet>
  );
};

export default SEO;

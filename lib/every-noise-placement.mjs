const labelAliases = new Map(Object.entries({
  'alternative hip hop': 'alternative hip hop',
  'african': 'afropop',
  'ambient music': 'ambient',
  'americana': 'roots rock',
  'ballet': 'classical',
  'brass band jazz': 'brass band',
  'classical crossover': 'classical',
  'comedy hip hop': 'comedy rap',
  'contemporary r and b': 'contemporary r and b',
  'dance': 'dance pop',
  'dance music': 'dance pop',
  'electronic dance music': 'edm',
  'electronic': 'electronica',
  'electronic music': 'electronica',
  'film score': 'soundtrack',
  'folk music': 'folk',
  'gangsta rap': 'gangster rap',
  'heavy metal': 'metal',
  'hip hop rap': 'hip hop',
  'hip hop': 'hip hop',
  'house music': 'house',
  'latin': 'latin pop',
  'music of ireland': 'irish folk',
  'musica popular brasileira': 'mpb',
  'musical play': 'broadway',
  'musical theatre': 'broadway',
  'modern folk': 'indie folk',
  'neo soul': 'neo soul',
  'novelty pop': 'novelty',
  'pop music': 'pop',
  'punk and post punk': 'post-punk',
  'punk rock': 'punk',
  'r and b soul': 'r and b',
  'rapping': 'rap',
  'romantic classical': 'classical era',
  'rock music': 'rock',
  'singer songwriter folk': 'singer songwriter',
  'synth pop': 'synthpop',
  'traditional folk music': 'traditional folk',
  'uk rap': 'uk hip hop',
  'video game score': 'video game music',
}));

export const familyReferenceGenres = {
  Classical: ['classical'],
  Experimental: ['experimental'],
  Country: ['country'],
  Electronic: ['electronica', 'edm', 'house', 'techno'],
  'Modern Folk': ['indie folk', 'singer-songwriter', 'folk rock'],
  'Hip-hop': ['hip hop', 'rap'],
  Jazz: ['jazz'],
  Pop: ['pop'],
  'R&B, Soul & Blues': ['r&b', 'soul', 'blues'],
  Rock: ['rock'],
  World: ['world', 'world fusion'],
  'Traditional Folk': ['traditional folk', 'folk'],
};

export function buildReferenceIndex(reference) {
  return new Map(reference.genres.map((genre) => [genre.key, genre]));
}

export function placeTrackInEveryNoise(row, referenceIndex, artistMemberships = new Map(), catalogArtistMemberships = new Map()) {
  const rawLabels = [row.genre_primary, ...splitSecondaryGenres(row.genre_secondary)];
  const matches = unique(rawLabels.flatMap((label) => matchReferenceGenre(label, referenceIndex)));
  if (matches.length > 0) {
    const coordinate = centroid(matches);
    return {
      ...coordinate,
      method: matches.length === 1 ? 'every-noise-exact-genre' : 'every-noise-genre-centroid',
      referenceGenres: matches.map((genre) => genre.genre),
      referenceMatchCount: matches.length,
      referenceConfidence: matches.length === 1 ? 'high' : 'medium',
      referenceSource: ['https://everynoise.com/engenremap.html'],
    };
  }

  const primaryArtistId = String(row.spotify_artist_ids ?? '').split(';').map((value) => value.trim()).find(Boolean);
  const artistMembership = primaryArtistId ? artistMemberships.get(primaryArtistId) : undefined;
  const artistGenres = unique((artistMembership?.genres ?? []).flatMap((label) => matchReferenceGenre(label, referenceIndex)));
  if (artistGenres.length > 0) {
    return {
      ...centroid(artistGenres),
      method: 'every-noise-artist-membership-centroid',
      referenceGenres: artistGenres.map((genre) => genre.genre),
      referenceMatchCount: artistGenres.length,
      referenceConfidence: 'medium',
      referenceSource: artistMembership.sourcePages,
    };
  }

  const primaryArtistName = String(row.artist_names ?? '').split(';')[0].trim();
  const catalogMembership = catalogArtistMemberships.get(primaryArtistName);
  const catalogGenres = unique((catalogMembership?.genres ?? []).flatMap((label) => matchReferenceGenre(label, referenceIndex)));
  if (catalogGenres.length > 0) {
    return {
      ...centroid(catalogGenres),
      method: 'every-noise-catalog-artist-genre-centroid',
      referenceGenres: catalogGenres.map((genre) => genre.genre),
      referenceMatchCount: catalogGenres.length,
      referenceConfidence: 'medium',
      referenceSource: catalogMembership.sourcePages,
    };
  }

  const familyGenres = (familyReferenceGenres[row.genre_family] ?? []).flatMap((label) => matchReferenceGenre(label, referenceIndex));
  if (familyGenres.length === 0) {
    throw new Error(`No Every Noise reference fallback exists for ${row.genre_family}`);
  }
  return {
    ...centroid(familyGenres),
    method: 'every-noise-family-reference-centroid',
    referenceGenres: familyGenres.map((genre) => genre.genre),
    referenceMatchCount: 0,
    referenceConfidence: 'low',
    referenceSource: ['https://everynoise.com/engenremap.html'],
  };
}

export function matchReferenceGenre(label, referenceIndex) {
  const normalized = normalizeGenre(label);
  if (!normalized) return [];
  const candidates = uniqueStrings([
    normalized,
    labelAliases.get(normalized),
    normalized.replace(/ music$/, ''),
    normalized.replace(/^modern /, ''),
  ].filter(Boolean));
  for (const candidate of candidates) {
    const match = referenceIndex.get(candidate);
    if (match) return [match];
  }
  return [];
}

export function normalizeGenre(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitSecondaryGenres(value) {
  return String(value ?? '').split(/[;,|]/).map((label) => label.trim()).filter(Boolean);
}

function centroid(genres) {
  return {
    x: round(genres.reduce((sum, genre) => sum + genre.x, 0) / genres.length),
    y: round(genres.reduce((sum, genre) => sum + genre.y, 0) / genres.length),
  };
}

function unique(items) {
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

function uniqueStrings(items) {
  return [...new Set(items)];
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

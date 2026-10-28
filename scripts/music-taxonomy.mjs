const RULES = [
  {
    family: 'Classical',
    terms: ['classical', 'baroque', 'romantic', 'renaissance', 'medieval', 'opera', 'orchestral', 'chamber music', 'symphony', 'symphonic music', 'concerto', 'minimalism', 'neoclassic', 'cello', 'film composer', 'film score', 'score'],
  },
  {
    family: 'Experimental',
    terms: ['experimental', 'avant-garde', 'avant garde', 'noise', 'drone', 'musique concrète', 'musique concrete', 'electroacoustic', 'industrial', 'outsider music', 'sound art', 'spoken word', 'poetry'],
  },
  {
    family: 'Country',
    terms: ['country', 'country music', 'americana', 'bluegrass', 'bluegrass music', 'alt-country', 'alternative country', 'honky tonk', 'outlaw country', 'western swing', 'old-time', 'rockabilly'],
  },
  {
    family: 'Electronic',
    terms: ['electronic', 'electronica', 'electro', 'ambient', 'house', 'techno', 'trance', 'dubstep', 'drum and bass', 'synthpop', 'synth-pop', 'idm', 'downtempo', 'disco', 'edm', 'dance', 'alternative dance', 'dance music', 'big beat', 'uk garage', 'eurodance', 'new age', 'new age music', 'video game music', 'video game', 'vgm'],
  },
  {
    family: 'Modern Folk',
    terms: ['folk', 'folk music', 'indie folk', 'folk rock', 'contemporary folk', 'folk pop', 'singer-songwriter', 'singer songwriter', 'anti-folk', 'chamber folk', 'freak folk', 'progressive folk', 'filk'],
  },
  {
    family: 'Hip-hop',
    terms: ['hip hop', 'hip-hop', 'abstract hip hop', 'instrumental hip hop', 'alternative hip hop', 'rap', 'trap', 'grime', 'boom bap', 'drill', 'bounce music'],
  },
  {
    family: 'Jazz',
    terms: ['jazz', 'bebop', 'bop', 'swing', 'ragtime', 'dixieland', 'free jazz', 'cool jazz', 'modal jazz', 'big band'],
  },
  {
    family: 'Pop',
    terms: ['pop', 'dance-pop', 'art pop', 'indie pop', 'vocal', 'electropop', 'power pop', 'a cappella', 'comedy', 'comedy music', 'humor', 'christian music', 'contemporary christian music', 'children\'s', 'children\'s music', 'vaudeville', 'independent music', 'musical', 'musical play', 'stage & screen', 'stage and screen', 'soundtrack', 'theme'],
  },
  {
    family: 'R&B, Soul & Blues',
    terms: ['rhythm and blues', 'r&b', 'rnb', 'alternative r&b', 'contemporary r&b', 'soul', 'funk', 'neo soul', 'motown', 'blues', 'doo-wop', 'doo wop', 'gospel'],
  },
  {
    family: 'Rock',
    terms: ['rock', 'alternative rock', 'indie rock', 'space rock', 'folk rock', 'pop rock', 'pop punk', 'art rock', 'jazz rock', 'experimental rock', 'post-rock', 'noise rock', 'ska punk', 'folk punk', 'punk', 'post-punk', 'no wave', 'metal', 'alternative metal', 'nu metal', 'heavy metal', 'speed metal', 'progressive metal', 'metalcore', 'melodic metalcore', 'post-hardcore', 'djent', 'blackgaze', 'grunge', 'shoegaze', 'britpop', 'emo', 'hardcore', 'psychedelic', 'new wave'],
  },
  {
    family: 'World',
    terms: ['world', 'world music', 'weltmusik', 'regional', 'african', 'reggae', 'ska', 'dub music', 'latin', 'afrobeat', 'afrobeats', 'highlife', 'chimurenga', 'qawwali', 'raï', 'rai music', 'flamenco', 'bossa nova', 'samba', 'rumba', 'calypso', 'gamelan', 'cumbia', 'salsa', 'fado', 'klezmer', 'mariachi', 'axé', 'tango', 'electrotango', 'algerian chaabi', 'maloya', 'music of guadeloupe', 'soukous', 'rebetiko', 'laïko', 'arabic music', 'arabic', 'turkish', 'chalga', 'bollywood', 'timba', 'music of greece', 'cuban rumba', 'boogaloo', 'music of galicia', 'romani', 'romani music', 'zouk', 'indian classical', 'persian classical', 'hindustani classical', 'carnatic', 'hawaiian'],
  },
  {
    family: 'Traditional Folk',
    terms: ['traditional folk', 'traditional folk music', 'traditional music', 'folk tradition', 'ethnic folk', 'indigenous music', 'work song', 'sea shanty', 'sea shanties', 'cajun music', 'powwow music', 'celtic', 'celtic music', 'nordic', 'min\'yō', 'polka', 'pizzica', 'music of ireland'],
  },
];

const PERIOD_RULES = [
  ['Medieval', ['medieval', 'medieval music']],
  ['Renaissance', ['renaissance', 'renaissance music']],
  ['Baroque', ['baroque', 'baroque music']],
  ['Classical period', ['classical period']],
  ['Romantic', ['romantic classical', 'romantic era', 'romantic music']],
  ['Modern classical', ['modern classical', 'modern classical music', 'contemporary classical', 'contemporary classical music', 'minimalism', 'neoclassical']],
  ['Early jazz', ['ragtime', 'dixieland', 'new orleans jazz']],
  ['Swing', ['swing', 'big band']],
  ['Bebop', ['bebop', 'hard bop', 'post-bop']],
  ['Cool & modal', ['cool jazz', 'modal jazz']],
  ['Free jazz', ['free jazz', 'avant-garde jazz']],
  ['Jazz fusion', ['jazz fusion', 'fusion jazz']],
  ['British invasion', ['british invasion', 'merseybeat']],
  ['Psychedelic', ['psychedelic rock', 'acid rock']],
  ['Punk & post-punk', ['punk rock', 'post-punk', 'hardcore punk']],
  ['Alternative', ['alternative rock', 'indie rock', 'grunge', 'shoegaze']],
  ['Golden age hip-hop', ['golden age hip hop', 'old school hip hop', 'boom bap']],
  ['Neo-soul', ['neo soul']],
  ['Contemporary', ['contemporary r&b', 'trap', 'indie pop', 'electropop']],
];

function normalize(value) {
  return value.toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();
}

const CLASSICAL_FALSE_FRIENDS = new Set(['baroque pop', 'new romantic', 'neo-medieval music', 'indian classical', 'persian classical', 'hindustani classical', 'carnatic']);

export function classifyGenres(inputGenres = []) {
  const genres = [...new Set(inputGenres.map(normalize).filter(Boolean))];
  const scores = RULES.map((rule) => ({
    family: rule.family,
    score: genres.reduce((total, genre) => {
      if (rule.family === 'Classical' && CLASSICAL_FALSE_FRIENDS.has(genre)) return total;
      const bestMatch = Math.max(0, ...rule.terms.map((term) => genre === term ? 3 : genre.includes(term) ? 1 : 0));
      return total + bestMatch;
    }, 0),
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);

  const historicalPeriod = PERIOD_RULES.find(([, terms]) =>
    genres.some((genre) => terms.some((term) => genre === term)),
  )?.[0] ?? '';

  return {
    family: scores[0]?.family ?? 'Other',
    primary: genres[0] ?? '',
    secondary: genres.slice(1, 4).join('; '),
    historicalPeriod,
    confidence: scores[0]?.score >= 3 ? 'high' : scores[0] ? 'medium' : 'low',
    normalizedGenres: genres,
  };
}

export function classifyRankedGenres(items = []) {
  const evidence = items
    .map((item, index) => ({
      name: String(item.name ?? '').trim(),
      count: Math.max(1, Number(item.count ?? 0)),
      kind: item.kind === 'genre' ? 'genre' : 'tag',
      index,
    }))
    .filter((item) => item.name);
  const scores = new Map();
  for (const item of evidence) {
    const classification = classifyGenres([item.name]);
    if (classification.family === 'Other') continue;
    const weight = item.count * (item.kind === 'genre' ? 3 : 1);
    const current = scores.get(classification.family) ?? { score: 0, firstIndex: item.index };
    current.score += weight;
    current.firstIndex = Math.min(current.firstIndex, item.index);
    scores.set(classification.family, current);
  }
  const winningFamily = [...scores]
    .sort((left, right) => right[1].score - left[1].score || left[1].firstIndex - right[1].firstIndex)[0]?.[0];
  if (!winningFamily) return classifyGenres([]);
  const winningLabels = evidence
    .filter((item) => classifyGenres([item.name]).family === winningFamily)
    .map((item) => item.name);
  return classifyGenres(winningLabels);
}

export function parsePoint(value = '') {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(value);
  return match ? { longitude: Number(match[1]), latitude: Number(match[2]) } : null;
}

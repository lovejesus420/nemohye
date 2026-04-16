const TRAVELMONTH_PAGES = [
  {
    url: 'https://korean.visitkorea.or.kr/travelmonth/benefits/traffic.do',
    category: '교통',
    parser: 'section',
  },
  {
    url: 'https://korean.visitkorea.or.kr/travelmonth/benefits/stay.do',
    category: '숙박',
    parser: 'section',
  },
  {
    url: 'https://korean.visitkorea.or.kr/travelmonth/benefits/special.do',
    category: '여행상품',
    parser: 'section',
  },
  {
    url: 'https://korean.visitkorea.or.kr/travelmonth/benefits/depopulation.do',
    category: '인구감소지역 특별할인',
    parser: 'section',
  },
  {
    url: 'https://korean.visitkorea.or.kr/travelmonth/benefit.do',
    category: '지역 여행할인',
    parser: 'modal',
  },
];

const DEFAULT_SOURCE = 'https://korean.visitkorea.or.kr/travelmonth/main.do';

function decodeHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' '));
}

function cleanText(value = '') {
  return stripTags(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extractAll(regex, value) {
  const safeRegex = regex.global
    ? regex
    : new RegExp(regex.source, `${regex.flags}g`);
  return [...String(value).matchAll(safeRegex)];
}

function absolutizeUrl(url, base) {
  if (!url) return base || DEFAULT_SOURCE;
  try {
    return new URL(url, base || DEFAULT_SOURCE).toString();
  } catch {
    return url;
  }
}

function getEndDate(period = '') {
  const matches = [...String(period).matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  return matches.length ? matches[matches.length - 1] : null;
}

function getEndDateFromKoreanPeriod(period = '') {
  const text = String(period);
  const matches = [...text.matchAll(/(?:(\d{4})[.\-년\s]*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const year = Number(last[1] || new Date().getFullYear());
  const month = String(Number(last[2])).padStart(2, '0');
  const day = String(Number(last[3])).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function scoreUsefulness(title = '', amount = '') {
  const text = `${title} ${amount}`;
  if (/100%|반값|최대\s*7만원|최대\s*50%/i.test(text)) return 9;
  if (/최대|할인|무료|지원|증정/i.test(text)) return 8;
  return 7;
}

function buildBenefitRecord({
  category,
  title,
  provider = '',
  benefit = '',
  apply = '',
  deadline = null,
  sourceUrl = DEFAULT_SOURCE,
}) {
  const safeTitle = cleanText(title);
  const safeProvider = cleanText(provider);
  const safeBenefit = cleanText(benefit);
  const safeApply = cleanText(apply);

  return {
    카테고리: category || '문화/여행',
    혜택명: safeTitle,
    지원대상: safeProvider || '대한민국 구석구석 여행가는 달 참여 대상',
    지원내용: safeBenefit || '상세 페이지 참조',
    신청방법: safeApply || '출처 링크에서 예약 또는 상세 안내 확인',
    마감일: deadline,
    실생활_유용도: scoreUsefulness(safeTitle, safeBenefit),
    출처: sourceUrl || DEFAULT_SOURCE,
  };
}

function parseDlMap(block) {
  const map = {};
  for (const match of extractAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi, block)) {
    const key = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (key) map[key] = value;
  }
  return map;
}

function parseModalPage(html, pageMeta) {
  const benefits = [];
  const modalBlocks = extractAll(
    /<div id="modal-benefit-[^"]+"[\s\S]*?<article>([\s\S]*?)<\/article>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
    html
  );

  for (const [, block] of modalBlocks) {
    const provider = cleanText(block.match(/<header>[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] || '');
    const title = cleanText(block.match(/<header>[\s\S]*?<h3>([\s\S]*?)<\/h3>/i)?.[1] || '');
    if (!title) continue;

    const tags = extractAll(/<header>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i, block)
      .flatMap((m) => extractAll(/<li>([\s\S]*?)<\/li>/gi, m[1]))
      .map((m) => cleanText(m[1]))
      .filter(Boolean);

    const dlMap = parseDlMap(block);
    const detailUrl = absolutizeUrl(block.match(/<a href="([^"]+)"/i)?.[1] || '', pageMeta.url);
    const period = dlMap['기간'] || dlMap['판매 기간'] || '';
    const deadline = getEndDate(period) || getEndDateFromKoreanPeriod(period);

    const benefitText = [
      dlMap['할인혜택'],
      tags.length ? `태그: ${tags.join(', ')}` : '',
      dlMap['문의처'] ? `문의처: ${dlMap['문의처']}` : '',
    ].filter(Boolean).join('\n');

    const applyText = [
      detailUrl !== pageMeta.url ? `상세 페이지 접속: ${detailUrl}` : '',
      period ? `이용 기간: ${period}` : '',
      '여행가는 달 상세 페이지에서 조건 확인 후 예약 또는 현장 이용',
    ].filter(Boolean).join('\n');

    benefits.push(buildBenefitRecord({
      category: pageMeta.category,
      title,
      provider,
      benefit: benefitText,
      apply: applyText,
      deadline,
      sourceUrl: detailUrl || pageMeta.url,
    }));
  }

  return benefits;
}

function parseSectionPage(html, pageMeta) {
  const benefits = [];
  const sectionBlocks = extractAll(/<article data-item="[^"]+">([\s\S]*?)<\/article>/gi, html);

  for (const [, block] of sectionBlocks) {
    const title = cleanText(block.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || '');
    if (!title) continue;

    const topDivMatch = block.match(/<article data-item="[^"]+">\s*<div>([\s\S]*?)<\/div>\s*<div>/i);
    const leftColumn = topDivMatch?.[1] || block;
    const dlMap = parseDlMap(leftColumn);
    const subheads = extractAll(/<h4>([\s\S]*?)<\/h4>/gi, leftColumn).map((m) => cleanText(m[1])).filter(Boolean);
    const paras = extractAll(/<p>([\s\S]*?)<\/p>/gi, leftColumn).map((m) => cleanText(m[1])).filter(Boolean);
    const listItems = extractAll(/<li>([\s\S]*?)<\/li>/gi, leftColumn).map((m) => cleanText(m[1])).filter(Boolean);
    const links = extractAll(/<a href="([^"]+)"/gi, block).map((m) => absolutizeUrl(m[1], pageMeta.url));

    const period = dlMap['기간'] || dlMap['판매 기간'] || dlMap['이용 기간'] || dlMap['쿠폰 발급 및 입실기간'] || '';
    const deadline = getEndDate(period) || getEndDateFromKoreanPeriod(period);
    const provider = `여행가는 달 ${pageMeta.category} 혜택`;

    const benefitText = [
      ...subheads.slice(0, 3),
      ...paras.slice(0, 4),
      ...listItems.slice(0, 4),
    ].filter(Boolean).join('\n');

    const applyText = [
      Object.entries(dlMap).map(([k, v]) => `${k}: ${v}`).join('\n'),
      links.length ? `관련 링크: ${links.join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    benefits.push(buildBenefitRecord({
      category: pageMeta.category,
      title,
      provider,
      benefit: benefitText,
      apply: applyText,
      deadline,
      sourceUrl: links[0] || pageMeta.url,
    }));
  }

  return benefits;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': DEFAULT_SOURCE,
    },
  });

  if (!res.ok) {
    throw new Error(`Travelmonth fetch failed: ${res.status} ${url}`);
  }

  return await res.text();
}

export async function scrapeTravelmonthBenefits() {
  const pages = await Promise.all(
    TRAVELMONTH_PAGES.map(async (pageMeta) => ({
      ...pageMeta,
      html: await fetchHtml(pageMeta.url),
    }))
  );

  const benefits = pages.flatMap((page) =>
    page.parser === 'modal'
      ? parseModalPage(page.html, page)
      : parseSectionPage(page.html, page)
  );

  const deduped = new Map();
  for (const benefit of benefits) {
    const key = `${benefit.혜택명}__${benefit.출처}`;
    if (!deduped.has(key)) deduped.set(key, benefit);
  }

  return [...deduped.values()];
}

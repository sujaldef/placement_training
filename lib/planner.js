import fs from 'fs';
import path from 'path';

let cachedSource = null;

const DEFAULT_VIDEO_SECONDS = 20 * 60;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseYouTubeVideoId(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const directId = text.match(/^[A-Za-z0-9_-]{6,}$/);
  if (directId) {
    return directId[0];
  }

  const watchId = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watchId) {
    return watchId[1];
  }

  const shortId = text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (shortId) {
    return shortId[1];
  }

  return '';
}

function cleanInt(value, fallback) {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateRange(startDate, endDate) {
  const startLabel = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startLabel} - ${endLabel}`;
}

function getDailyHours(date) {
  const month = date.getMonth();
  const day = date.getDate();

  if (month === 2 || month === 3) {
    return 4.5;
  }

  if (month === 4) {
    return 1.5;
  }

  if (month === 5) {
    return 5;
  }

  if (month === 6 && day <= 15) {
    return 5;
  }

  return 0;
}

function toHoursLabel(hours) {
  return Number.isInteger(hours) ? String(hours) : String(hours.toFixed(1));
}

function buildIndiaBixTopicUrl(topic) {
  const slug = String(topic || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  if (!slug) {
    return 'https://www.indiabix.com/';
  }

  return `https://www.indiabix.com/aptitude/${slug}/`;
}

function loadJson(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source);
}

function loadPlannerSource() {
  if (cachedSource) {
    return cachedSource;
  }

  const ytRaw = asArray(loadJson('ytdata.json'));
  const dsaRaw = asArray(loadJson('dsasheet.json'));
  const aptRaw = asArray(loadJson('indiabix.json'));

  const videos = ytRaw
    .map((video, index) => {
      const position = cleanInt(video.position, index + 1);
      const durationSeconds = Math.max(
        0,
        cleanInt(video.durationSeconds, DEFAULT_VIDEO_SECONDS),
      );

      return {
        id: `v-${position}`,
        position,
        videoId: String(video.videoId || '').trim(),
        title: String(video.title || `Video ${position}`).trim(),
        url: String(video.url || '').trim(),
        durationSeconds,
      };
    })
    .sort((a, b) => a.position - b.position);

  const videoById = new Map(videos.map((video) => [video.videoId, video]));
  const videoByPosition = new Map(
    videos.map((video) => [video.position, video]),
  );

  const dsaTopics = asArray(dsaRaw).flatMap((step, stepIndex) => {
    const stepTitle = String(step.step || `Step ${stepIndex + 1}`).trim();

    return asArray(step.topics).map((topic, topicIndex) => {
      const globalIndex = `${stepIndex + 1}-${topicIndex + 1}`;
      const youtubeUrl = String(
        topic.youtubeLink || topic.youtube?.url || '',
      ).trim();
      const youtubeId = parseYouTubeVideoId(youtubeUrl);
      const linkedVideo = youtubeId ? videoById.get(youtubeId) : null;

      return {
        id: `dsa-${globalIndex}`,
        step: stepTitle,
        topic: String(topic.topic || '').trim(),
        problemLink: String(topic.problemLink || '').trim(),
        platform: String(topic.platform || '').trim(),
        difficulty: String(topic.difficulty || '').trim(),
        youtubeUrl,
        linkedVideoId: linkedVideo?.id || '',
        linkedVideoPosition: linkedVideo?.position || null,
      };
    });
  });

  const dsaByVideoPosition = new Map();
  for (const topic of dsaTopics) {
    if (!topic.linkedVideoPosition) {
      continue;
    }

    const list = dsaByVideoPosition.get(topic.linkedVideoPosition) || [];
    list.push(topic);
    dsaByVideoPosition.set(topic.linkedVideoPosition, list);
  }

  const aptitudeTopics = aptRaw.map((topic, index) => ({
    id: `apt-${index + 1}`,
    category: String(topic.category || '').trim(),
    subCategory: String(topic.subCategory || '').trim(),
    topic: String(topic.topic || '').trim(),
    subTopic: String(topic.subTopic || '').trim(),
    questionCount: Math.max(0, cleanInt(topic.questionCount, 20)),
    link: buildIndiaBixTopicUrl(topic.topic),
  }));

  cachedSource = {
    videos,
    dsaTopics,
    aptitudeTopics,
    dsaByVideoPosition,
    videoByPosition,
  };

  return cachedSource;
}

function getDefaultStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  return `${year}-03-01`;
}

function parsePlannerSettings(input) {
  const source = input || {};
  const baseDate =
    fromIsoDate(source.startDate) || fromIsoDate(getDefaultStartDate());
  const startDate = toIsoDate(baseDate);

  const startVideoPosition = Math.max(
    1,
    cleanInt(source.startVideoPosition, 1),
  );

  const startDsaTopicId = String(source.startDsaTopicId || '').trim();
  const aptitudeRaw = String(source.startAptitudeId || '').trim();
  const startAptitudeId =
    aptitudeRaw && aptitudeRaw !== 'none' ? aptitudeRaw : '';

  return {
    startDate,
    startVideoPosition,
    startDsaTopicId,
    startAptitudeId,
  };
}

function getPlanEndDate(startDate) {
  const year = startDate.getFullYear();
  return new Date(year, 6, 15);
}

function buildDayName(videos, index) {
  if (!videos.length) {
    return `Focused practice day ${index + 1}`;
  }

  const first = videos[0];
  const last = videos[videos.length - 1];
  if (first.position === last.position) {
    return `Video ${first.position} deep dive`;
  }

  return `Videos ${first.position}-${last.position} sprint`;
}

function clampIndex(value, max) {
  const parsed = Math.max(0, cleanInt(value, 0));
  if (max <= 0) {
    return 0;
  }
  return Math.min(parsed, max - 1);
}

function generateDays(settings, source) {
  const startDate =
    fromIsoDate(settings.startDate) || fromIsoDate(getDefaultStartDate());
  const endDate = getPlanEndDate(startDate);
  const days = [];

  const videoStartIndex = Math.max(
    0,
    source.videos.findIndex(
      (video) => video.position >= settings.startVideoPosition,
    ),
  );

  let videoCursor = clampIndex(videoStartIndex, source.videos.length);

  let dsaCursor = 0;
  if (settings.startDsaTopicId) {
    const located = source.dsaTopics.findIndex(
      (topic) => topic.id === settings.startDsaTopicId,
    );
    if (located >= 0) {
      dsaCursor = located;
    }
  }

  let aptitudeCursor = 0;
  let aptitudeEnabled = true;

  if (settings.startAptitudeId) {
    const foundAptitude = source.aptitudeTopics.findIndex(
      (topic) => topic.id === settings.startAptitudeId,
    );
    aptitudeCursor = foundAptitude >= 0 ? foundAptitude : 0;
  }

  const inRange = new Date(startDate);
  let dayCount = 0;

  while (inRange <= endDate && dayCount < 250) {
    const hours = getDailyHours(inRange);
    if (hours <= 0) {
      inRange.setDate(inRange.getDate() + 1);
      continue;
    }

    const dayVideos = [];
    const dayTasks = [];
    const targetVideoSeconds = Math.floor(hours * 3600 * 0.7);
    let consumedVideoSeconds = 0;

    while (videoCursor < source.videos.length && dayVideos.length < 5) {
      const currentVideo = source.videos[videoCursor];
      const videoSeconds =
        currentVideo.durationSeconds || DEFAULT_VIDEO_SECONDS;

      if (
        dayVideos.length > 0 &&
        consumedVideoSeconds + videoSeconds > targetVideoSeconds
      ) {
        break;
      }

      const mapId = currentVideo.id;
      dayVideos.push(currentVideo);
      consumedVideoSeconds += videoSeconds;

      videoCursor += 1;
    }

    const usedTopicIds = new Set();
    let maxConsumedDsaIndex = dsaCursor;

    for (const video of dayVideos) {
      const videoSeconds = video.durationSeconds || DEFAULT_VIDEO_SECONDS;
      dayTasks.push({
        cat: 'DSA',
        dot: 'dsa',
        mapId: video.id,
        text: `Video #${video.position}: ${video.title} (${formatDuration(videoSeconds)})`,
        link: video.url,
        linkLabel: 'Watch',
      });

      const videoTopics = [];
      const linkedTopics = source.dsaByVideoPosition.get(video.position) || [];

      for (const topic of linkedTopics) {
        const topicIndex = source.dsaTopics.findIndex(
          (item) => item.id === topic.id,
        );
        if (topicIndex < dsaCursor || usedTopicIds.has(topic.id)) {
          continue;
        }

        usedTopicIds.add(topic.id);
        videoTopics.push(topic);
        maxConsumedDsaIndex = Math.max(maxConsumedDsaIndex, topicIndex + 1);

        if (videoTopics.length >= 3) {
          break;
        }
      }

      while (videoTopics.length < 2 && dsaCursor < source.dsaTopics.length) {
        const fallbackTopic = source.dsaTopics[dsaCursor];
        dsaCursor += 1;

        if (usedTopicIds.has(fallbackTopic.id)) {
          continue;
        }

        usedTopicIds.add(fallbackTopic.id);
        videoTopics.push(fallbackTopic);
      }

      for (const topic of videoTopics) {
        dayTasks.push({
          cat: 'DSA',
          dot: 'dsa',
          mapId: topic.linkedVideoId || video.id,
          text: `DSA for Video #${video.position}: ${topic.topic}`,
          link:
            topic.problemLink ||
            'https://takeuforward.org/interviews/strivers-sde-sheet-top-coding-interview-problems/',
          linkLabel: 'Solve',
        });
      }
    }

    dsaCursor = Math.max(dsaCursor, maxConsumedDsaIndex);

    if (!dayVideos.length) {
      let standaloneAdded = 0;
      while (standaloneAdded < 3 && dsaCursor < source.dsaTopics.length) {
        const topic = source.dsaTopics[dsaCursor];
        dsaCursor += 1;

        dayTasks.push({
          cat: 'DSA',
          dot: 'dsa',
          mapId: topic.linkedVideoId || topic.id,
          text: `DSA practice: ${topic.topic}`,
          link:
            topic.problemLink ||
            'https://takeuforward.org/interviews/strivers-sde-sheet-top-coding-interview-problems/',
          linkLabel: 'Solve',
        });

        standaloneAdded += 1;
      }
    }

    if (aptitudeEnabled && source.aptitudeTopics.length > 0) {
      const aptitudeTopic =
        source.aptitudeTopics[aptitudeCursor % source.aptitudeTopics.length];
      aptitudeCursor += 1;

      dayTasks.push({
        cat: 'APT',
        dot: 'apt',
        text: `${aptitudeTopic.topic} (${aptitudeTopic.questionCount} Q)`,
        link: aptitudeTopic.link,
        linkLabel: 'Practice',
      });
    }

    dayTasks.push({
      cat: 'REV',
      dot: 'rev',
      text: 'Revision: summarize today and redo one weak problem without hints.',
    });

    days.push({
      id: `day-${toIsoDate(inRange)}`,
      isoDate: toIsoDate(inRange),
      date: formatDayDate(inRange),
      name: buildDayName(dayVideos, dayCount),
      hours: toHoursLabel(hours),
      tasks: dayTasks,
    });

    inRange.setDate(inRange.getDate() + 1);
    dayCount += 1;
  }

  return days;
}

function getPhaseLabel(date) {
  const month = date.getMonth();
  if (month === 2 || month === 3) {
    return 'p1';
  }
  if (month === 4) {
    return 'p2';
  }
  return 'p3';
}

function makeWeekTitle(days) {
  const videos = [];

  for (const day of days) {
    for (const task of day.tasks || []) {
      const match = String(task.text || '').match(/^Video #(\d+):/);
      if (match) {
        videos.push(Number(match[1]));
      }
    }
  }

  if (videos.length === 0) {
    return 'Practice + revision week';
  }

  const min = Math.min(...videos);
  const max = Math.max(...videos);
  if (min === max) {
    return `Video ${min} focus week`;
  }

  return `Videos ${min}-${max} progress week`;
}

function buildWeeks(days) {
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    const weekStart = fromIsoDate(weekDays[0].isoDate);
    const weekEnd = fromIsoDate(weekDays[weekDays.length - 1].isoDate);

    const doneVideoNumbers = weekDays
      .flatMap((day) => day.tasks || [])
      .map((task) => String(task.text || '').match(/^Video #(\d+):/))
      .filter(Boolean)
      .map((match) => Number(match[1]));

    const milestoneVideo = doneVideoNumbers.length
      ? Math.max(...doneVideoNumbers)
      : null;

    weeks.push({
      id: `w-${weekDays[0].isoDate}`,
      phase: getPhaseLabel(weekStart),
      num: weeks.length + 1,
      title: makeWeekTitle(weekDays),
      dateRange: formatDateRange(weekStart, weekEnd),
      startDate: weekDays[0].isoDate,
      milestone: {
        icon: milestoneVideo ? '🎯' : '📌',
        title: milestoneVideo
          ? `Reach video #${milestoneVideo}`
          : 'Maintain consistent progress',
        sub: `Daily capacity follows month-wise study hours`,
      },
      days: weekDays,
    });
  }

  return weeks;
}

export function getPlannerData(inputSettings = {}) {
  const source = loadPlannerSource();
  const settings = parsePlannerSettings(inputSettings);
  const days = generateDays(settings, source);

  return {
    settings,
    weeks: buildWeeks(days),
    meta: {
      videos: source.videos.map((video) => ({
        id: video.id,
        position: video.position,
        title: video.title,
        durationSeconds: video.durationSeconds,
      })),
      dsaTopics: source.dsaTopics.map((topic) => ({
        id: topic.id,
        topic: topic.topic,
        step: topic.step,
        linkedVideoPosition: topic.linkedVideoPosition,
      })),
      aptitudeTopics: source.aptitudeTopics.map((topic) => ({
        id: topic.id,
        topic: topic.topic,
        category: topic.category,
        subCategory: topic.subCategory,
        questionCount: topic.questionCount,
      })),
    },
  };
}

export function getDefaultPlannerSettings() {
  return parsePlannerSettings({});
}

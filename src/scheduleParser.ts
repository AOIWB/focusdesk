import {
  addDays,
  dateKey,
  dateFromKey,
  localDateTime,
  validSchedule,
  type Schedule,
} from "./calendar";

const digits: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
function number(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  if (text.includes("十")) {
    const [tens, ones] = text.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return digits[text];
}
export function parseDate(input: string, now = new Date()): string | undefined {
  const today = dateKey(now);
  const full = input.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (full)
    return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  const month = input.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (month)
    return `${now.getFullYear()}-${month[1].padStart(2, "0")}-${month[2].padStart(2, "0")}`;
  if (/大后天/.test(input)) return addDays(today, 3);
  if (/后天/.test(input)) return addDays(today, 2);
  if (/明天|明早|明晚/.test(input)) return addDays(today, 1);
  if (/今天|今日|今晚|今早/.test(input)) return today;
  const weekday = input.match(
    /(下下|下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])/,
  );
  if (weekday) {
    const target = "一二三四五六日".indexOf(weekday[2].replace("天", "日"));
    const current = (now.getDay() + 6) % 7;
    const offset =
      weekday[1] === "下下"
        ? 14
        : weekday[1] === "下"
          ? 7
          : !weekday[1] && target < current
            ? 7
            : 0;
    return addDays(today, target - current + offset);
  }
  return undefined;
}

const numeral = "(?:[0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})";
const period = "凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里";
const clockPattern = `(${period})?\\s*(${numeral})(?:[：:](${numeral})|[点时](?:(${numeral})(?!刻)分?)?)(半|一刻|三刻)?`;
interface Clock {
  hour: number;
  minute: number;
  period: string;
}
function readClock(match: RegExpMatchArray, inherited = ""): Clock {
  const part = match[1] || inherited;
  let hour = number(match[2]);
  const minute =
    match[5] === "半"
      ? 30
      : match[5] === "一刻"
        ? 15
        : match[5] === "三刻"
          ? 45
          : number(match[3] || match[4] || "0");
  if (/下午|傍晚|晚上|夜里/.test(part) && hour < 12) hour += 12;
  if (part === "中午" && hour < 11) hour += 12;
  if (part === "凌晨" && hour === 12) hour = 0;
  return { hour, minute, period: part };
}
function atTime(day: string, clock: Clock) {
  if (
    clock.hour > 24 ||
    clock.minute > 59 ||
    (clock.hour === 24 && clock.minute !== 0)
  )
    throw new Error("时间超出范围，请使用 0–23 点和 0–59 分");
  const date = dateFromKey(day);
  if (dateKey(date) !== day) throw new Error("日期不存在，请检查年月日");
  date.setHours(clock.hour, clock.minute, 0, 0);
  return localDateTime(date);
}

export function parseSchedule(
  input: string,
  now = new Date(),
): { schedule: Schedule; due: string; title: string } | undefined {
  // A clock must contain 点/时 or a colon, so dates and priority numbers are not treated as hours.
  const first = input.match(new RegExp(clockPattern));
  if (!first) return undefined;
  const datePrefix = input.slice(0, first.index);
  const day = parseDate(datePrefix, now) ?? dateKey(now);
  const firstClock = readClock(
    first,
    /明晚|今晚/.test(datePrefix) ? "晚上" : "",
  );
  const start = atTime(day, firstClock);
  const rest = input.slice(first.index! + first[0].length);
  const range = rest.match(
    new RegExp(
      `^\\s*(?:到|至|[-–—~～])\\s*((?:大后天|后天|明天|今天|次日|第二天)?\\s*)(${clockPattern})`,
    ),
  );
  let end: string,
    consumed = first.index! + first[0].length;
  if (range) {
    const endClockMatch = range[2].match(new RegExp(clockPattern))!;
    const endClock = readClock(endClockMatch, firstClock.period);
    const endDay = /次日|第二天/.test(range[1])
      ? addDays(day, 1)
      : (parseDate(range[1], now) ?? day);
    end = atTime(endDay, endClock);
    if (end <= start && !range[1].trim()) {
      if (
        endClock.hour < firstClock.hour &&
        /晚上|夜里|傍晚/.test(firstClock.period) &&
        !endClockMatch[1]
      ) {
        end = atTime(addDays(day, 1), {
          ...endClock,
          hour: endClock.hour % 12,
        });
      } else if (
        endClock.hour < firstClock.hour &&
        endClockMatch[1] === "凌晨"
      ) {
        end = atTime(addDays(day, 1), endClock);
      }
    }
    consumed += range[0].length;
  } else {
    const duration = rest.match(
      new RegExp(`^\\s*(?:持续|共|时长)?\\s*(${numeral})(?:个)?小时`),
    );
    const finish = new Date(start);
    finish.setMinutes(
      finish.getMinutes() + (duration ? number(duration[1]) * 60 : 60),
    );
    end = localDateTime(finish);
    if (duration) consumed += duration[0].length;
  }
  const schedule = { start, end };
  if (!validSchedule(schedule))
    throw new Error("结束时间需晚于开始时间，请再说明一下时间范围");
  const prefix = datePrefix.replace(
    /(20\d{2})[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}[日号]?|大后天|后天|明天|今天|今日|明早|明晚|今晚|今早|(下下|下|本|这)?(?:周|星期|礼拜)[一二三四五六日天]/g,
    "",
  );
  const title = `${prefix} ${input.slice(consumed)}`
    .replace(
      /^(?:请|帮我|给我|安排|添加|记录|记一下|在|从|必须|要|的|\s|[，,：:])+/g,
      "",
    )
    .replace(/^[，,：:\s]+|[，,。\s]+$/g, "")
    .trim();
  return { schedule, due: day, title: title || "新日程" };
}

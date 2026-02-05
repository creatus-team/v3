// lib/dayjs.ts
// 타임존이 설정된 dayjs - 프로젝트 전체에서 이 파일만 import해서 사용

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekday from 'dayjs/plugin/weekday';
import 'dayjs/locale/ko';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(weekday);
dayjs.tz.setDefault('Asia/Seoul');
dayjs.locale('ko');

export default dayjs;

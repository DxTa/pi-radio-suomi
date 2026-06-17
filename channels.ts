import { SR_CHANNELS } from "./sr-channels.ts";

export interface Channel {
  id: string;
  name: string;
  description: string;
  url: string;
  country?: "FI" | "SE";
  source?: "manual" | "sr";
  sourceId?: string;
  website?: string;
}

export const FINNISH_CHANNELS: Channel[] = [
  {
    id: "channel-rondo-classic-klasu-pro",
    name: "Rondo Classic Klasu Pro",
    description: "Classical music",
    url: "http://iradio.fi:8000/klasupro-hi.mp3",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-sun",
    name: "Radio Sun",
    description: "local Finnish stuff",
    url: "http://st.downtime.fi/sun.mp3",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-finest-fm",
    name: "Finest FM",
    description: "contemporary, Finnish and English songs",
    url: "http://212.47.220.188:8000/listen.mp3",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-sea-fm",
    name: "Sea FM",
    description: "contemporary, Finnish and English songs",
    url: "http://s3.myradiostream.com:4976/radio",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-helsinki",
    name: "Radio Helsinki",
    description: "contemporary, Finnish and English songs",
    url: "http://stream.radiohelsinki.fi/radio",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-dei",
    name: "Radio Dei",
    description: "Christian broadcasting",
    url: "http://isojako.radiodei.fi:8000/oulu",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-hear",
    name: "Radio Hear",
    description: "lots of old weird shit; 60s rock to Arabic songs",
    url: "http://hear.fi:8000/hear.mp3",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-roll-fm",
    name: "Roll FM",
    description: "old tracks (50s - 80s)",
    url: "http://stream.rollfm.fi/",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-patmos",
    name: "Radio Patmos",
    description: "Christian broadcasting, current affairs",
    url: "http://s3.yesstreaming.net:7011/radio",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-kaaos-radio-dubstep",
    name: "Kaaos Radio — dubstep",
    description: "dubstep, breakbeat",
    url: "http://stream.kaaosradio.fi:8000/stream2",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-kaaos-radio-chill",
    name: "Kaaos Radio — chill",
    description: "lo-fi, electronic",
    url: "http://stream.kaaosradio.fi:8000/chill",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radio-musa",
    name: "Radio Musa",
    description: "60s nostalgia tracks, jazz + country, English, Swedish and Finnish",
    url: "http://n09.radiojar.com/n6yg5q0z8vzuv.m4a",
    country: "FI",
    source: "manual",
  },
  {
    id: "channel-radiose",
    name: "RadioSE",
    description: "Classic rock, Finnish and English songs",
    url: "http://wr2.downtime.fi/kaakko.mp3",
    country: "FI",
    source: "manual",
  },
];

export const CHANNELS: Channel[] = [...FINNISH_CHANNELS, ...SR_CHANNELS];

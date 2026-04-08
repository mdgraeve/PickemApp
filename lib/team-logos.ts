// Maps (sport, teamName) → ESPN CDN logo URL.
// Returns null for unknown teams so callers can skip rendering the image.
//
// ESPN CDN patterns:
//   Pro:     https://a.espncdn.com/i/teamlogos/{league}/500/{abbr}.png
//   College: https://a.espncdn.com/i/teamlogos/ncaa/500/{id}.png

// ---------------------------------------------------------------------------
// NFL
// ---------------------------------------------------------------------------
const NFL: Record<string, string> = {
  "Arizona Cardinals": "ari",
  "Atlanta Falcons": "atl",
  "Baltimore Ravens": "bal",
  "Buffalo Bills": "buf",
  "Carolina Panthers": "car",
  "Chicago Bears": "chi",
  "Cincinnati Bengals": "cin",
  "Cleveland Browns": "cle",
  "Dallas Cowboys": "dal",
  "Denver Broncos": "den",
  "Detroit Lions": "det",
  "Green Bay Packers": "gb",
  "Houston Texans": "hou",
  "Indianapolis Colts": "ind",
  "Jacksonville Jaguars": "jax",
  "Kansas City Chiefs": "kc",
  "Las Vegas Raiders": "lv",
  "Los Angeles Chargers": "lac",
  "Los Angeles Rams": "lar",
  "Miami Dolphins": "mia",
  "Minnesota Vikings": "min",
  "New England Patriots": "ne",
  "New Orleans Saints": "no",
  "New York Giants": "nyg",
  "New York Jets": "nyj",
  "Philadelphia Eagles": "phi",
  "Pittsburgh Steelers": "pit",
  "San Francisco 49ers": "sf",
  "Seattle Seahawks": "sea",
  "Tampa Bay Buccaneers": "tb",
  "Tennessee Titans": "ten",
  "Washington Commanders": "wsh",
};

// ---------------------------------------------------------------------------
// NBA
// ---------------------------------------------------------------------------
const NBA: Record<string, string> = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gs",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "LA Clippers": "lac",
  "Los Angeles Clippers": "lac",
  "LA Lakers": "lal",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "no",
  "New York Knicks": "ny",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sa",
  "Toronto Raptors": "tor",
  "Utah Jazz": "utah",
  "Washington Wizards": "wsh",
};

// ---------------------------------------------------------------------------
// MLB
// ---------------------------------------------------------------------------
const MLB: Record<string, string> = {
  "Arizona Diamondbacks": "ari",
  "Atlanta Braves": "atl",
  "Baltimore Orioles": "bal",
  "Boston Red Sox": "bos",
  "Chicago Cubs": "chc",
  "Chicago White Sox": "cws",
  "Cincinnati Reds": "cin",
  "Cleveland Guardians": "cle",
  "Colorado Rockies": "col",
  "Detroit Tigers": "det",
  "Houston Astros": "hou",
  "Kansas City Royals": "kc",
  "Los Angeles Angels": "laa",
  "LA Angels": "laa",
  "Los Angeles Dodgers": "lad",
  "LA Dodgers": "lad",
  "Miami Marlins": "mia",
  "Milwaukee Brewers": "mil",
  "Minnesota Twins": "min",
  "New York Mets": "nym",
  "New York Yankees": "nyy",
  "Oakland Athletics": "oak",
  "Sacramento Athletics": "oak",
  "Philadelphia Phillies": "phi",
  "Pittsburgh Pirates": "pit",
  "San Diego Padres": "sd",
  "San Francisco Giants": "sf",
  "Seattle Mariners": "sea",
  "St. Louis Cardinals": "stl",
  "Tampa Bay Rays": "tb",
  "Texas Rangers": "tex",
  "Toronto Blue Jays": "tor",
  "Washington Nationals": "wsh",
};

// ---------------------------------------------------------------------------
// NHL
// ---------------------------------------------------------------------------
const NHL: Record<string, string> = {
  "Anaheim Ducks": "ana",
  "Boston Bruins": "bos",
  "Buffalo Sabres": "buf",
  "Calgary Flames": "cgy",
  "Carolina Hurricanes": "car",
  "Chicago Blackhawks": "chi",
  "Colorado Avalanche": "col",
  "Columbus Blue Jackets": "cbj",
  "Dallas Stars": "dal",
  "Detroit Red Wings": "det",
  "Edmonton Oilers": "edm",
  "Florida Panthers": "fla",
  "Los Angeles Kings": "la",
  "Minnesota Wild": "min",
  "Montreal Canadiens": "mtl",
  "Nashville Predators": "nsh",
  "New Jersey Devils": "nj",
  "New York Islanders": "nyi",
  "New York Rangers": "nyr",
  "Ottawa Senators": "ott",
  "Philadelphia Flyers": "phi",
  "Pittsburgh Penguins": "pit",
  "San Jose Sharks": "sj",
  "Seattle Kraken": "sea",
  "St. Louis Blues": "stl",
  "Tampa Bay Lightning": "tb",
  "Toronto Maple Leafs": "tor",
  "Utah Hockey Club": "utah",
  "Vancouver Canucks": "van",
  "Vegas Golden Knights": "vgk",
  "Washington Capitals": "wsh",
  "Winnipeg Jets": "wpg",
};

// ---------------------------------------------------------------------------
// College — ESPN uses numeric team IDs for the /ncaa/ path
// ---------------------------------------------------------------------------
const NCAAF: Record<string, string> = {
  // Power conferences and major programs
  Alabama: "333",
  "Ohio State": "194",
  Michigan: "130",
  Georgia: "61",
  Clemson: "228",
  "Notre Dame": "87",
  Oklahoma: "201",
  Texas: "251",
  LSU: "99",
  "Penn State": "213",
  Florida: "57",
  USC: "30",
  Oregon: "2483",
  Auburn: "2",
  Tennessee: "2633",
  Wisconsin: "275",
  Iowa: "2294",
  "Michigan State": "127",
  "Texas A&M": "245",
  Baylor: "239",
  Utah: "254",
  Cincinnati: "2132",
  "Ole Miss": "145",
  "Florida State": "52",
  "Miami (FL)": "2390",
  Miami: "2390",
  "North Carolina": "153",
  Pittsburgh: "221",
  "Virginia Tech": "259",
  "Kansas State": "2306",
  TCU: "2628",
  Arkansas: "8",
  Missouri: "142",
  Kentucky: "96",
  "Mississippi State": "344",
  Nebraska: "158",
  Colorado: "38",
  Washington: "264",
  "Oregon State": "204",
  Arizona: "12",
  "Arizona State": "9",
  UCLA: "26",
  California: "25",
  "Cal Bears": "25",
  Stanford: "24",
  "Iowa State": "66",
  "Texas Tech": "2641",
  "Oklahoma State": "197",
  "West Virginia": "277",
  Indiana: "84",
  Maryland: "120",
  Minnesota: "135",
  Northwestern: "77",
  Purdue: "2509",
  Rutgers: "164",
  Illinois: "356",
  Duke: "150",
  "Wake Forest": "154",
  Virginia: "258",
  "Boston College": "103",
  Syracuse: "183",
  Louisville: "97",
  "NC State": "152",
  "Georgia Tech": "59",
  "South Carolina": "2579",
  "Mississippi": "145",
  "Kansas": "2305",
  "Texas Christian": "2628",
};

const NCAAB: Record<string, string> = {
  Duke: "150",
  Kentucky: "96",
  Kansas: "2305",
  "North Carolina": "153",
  UNC: "153",
  Villanova: "222",
  Gonzaga: "2250",
  "Michigan State": "127",
  Indiana: "84",
  Connecticut: "41",
  UConn: "41",
  Arizona: "12",
  UCLA: "26",
  Syracuse: "183",
  Texas: "251",
  Baylor: "239",
  Houston: "248",
  Purdue: "2509",
  Tennessee: "2633",
  Alabama: "333",
  Arkansas: "8",
  Marquette: "269",
  "St. John's": "2599",
  Providence: "2507",
  Creighton: "156",
  Xavier: "2752",
  "Seton Hall": "2550",
  Georgetown: "46",
  Butler: "2110",
  Louisville: "97",
  Florida: "57",
  "Ohio State": "194",
  Michigan: "130",
  Wisconsin: "275",
  Iowa: "2294",
  Illinois: "356",
  "Iowa State": "66",
  Oregon: "2483",
  USC: "30",
  "Auburn": "2",
  "Mississippi State": "344",
  Missouri: "142",
  "Texas A&M": "245",
  Clemson: "228",
  "Virginia Tech": "259",
  Virginia: "258",
  "Penn State": "213",
  Northwestern: "77",
  Rutgers: "164",
  Minnesota: "135",
  Nebraska: "158",
  Maryland: "120",
  "Oklahoma": "201",
  Colorado: "38",
  Utah: "254",
  "Arizona State": "9",
  Stanford: "24",
  California: "25",
  "Washington": "264",
  "Oklahoma State": "197",
  "TCU": "2628",
  "Kansas State": "2306",
  "West Virginia": "277",
  "NC State": "152",
  "Wake Forest": "154",
  "Georgia Tech": "59",
  "Boston College": "103",
  "Miami (FL)": "2390",
  Pittsburgh: "221",
  "Notre Dame": "87",
  Gonzaga: "2250",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ESPN_BASE = "https://a.espncdn.com/i/teamlogos";

export function getTeamLogoUrl(sport: string, teamName: string): string | null {
  switch (sport) {
    case "NFL": {
      const abbr = NFL[teamName];
      return abbr ? `${ESPN_BASE}/nfl/500/${abbr}.png` : null;
    }
    case "NBA": {
      const abbr = NBA[teamName];
      return abbr ? `${ESPN_BASE}/nba/500/${abbr}.png` : null;
    }
    case "MLB": {
      const abbr = MLB[teamName];
      return abbr ? `${ESPN_BASE}/mlb/500/${abbr}.png` : null;
    }
    case "NHL": {
      const abbr = NHL[teamName];
      return abbr ? `${ESPN_BASE}/nhl/500/${abbr}.png` : null;
    }
    case "NCAAF": {
      const id = NCAAF[teamName];
      return id ? `${ESPN_BASE}/ncaa/500/${id}.png` : null;
    }
    case "NCAAB": {
      const id = NCAAB[teamName];
      return id ? `${ESPN_BASE}/ncaa/500/${id}.png` : null;
    }
    default:
      return null;
  }
}

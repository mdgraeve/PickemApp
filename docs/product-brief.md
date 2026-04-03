# Product Brief

## What is LockHub?

LockHub is a sports pick'em web application for social leagues. Users create or join leagues with friends, view upcoming games grouped into slates, submit their picks, and compete on a leaderboard.

## Target Users

- Friend groups who want a casual pick'em competition
- Office pools and social circles
- Casual sports fans (not high-stakes gambling)

## Core Concepts

### Sports
Each league is tied to a single sport (e.g. NFL, NBA, MLB). A user can belong to multiple leagues across different sports, but a single league does not mix sports.

Each sport has a default schedule of games maintained by the app. Leagues for that sport draw from this default schedule. Customizing the game list for a specific league is a future enhancement.

### Slates
Games within a league are grouped into slates (e.g. "Week 1", "NBA Round 1"). Only one slate is active at a time — the next slate is not released to users until the current slate is complete (all games finished and scored). This keeps the competition focused and prevents users from getting ahead.

### Picks
Users submit one pick per game (choose a winner) before the game starts. Picks lock at game start time. The leaderboard ranks members by total correct picks across all completed slates.

## MVP Features

- **User authentication** -- sign up, log in, manage sessions
- **Create / join leagues** -- start a league for a specific sport and invite friends via a shareable code
- **View games** -- browse upcoming games within the active slate
- **Submit picks** -- choose a winner for each game before it starts
- **Leaderboard scoring** -- rank members by correct picks within each league

## Out of Scope (MVP)

- Slate management (grouping games into slates, releasing slates sequentially)
- Default sport schedules / master game lists
- Payments / wagering
- Live scoring / real-time updates
- Native mobile app
- Advanced analytics or historical stats
- Push notifications
- Public/global leagues
- Custom game lists per league

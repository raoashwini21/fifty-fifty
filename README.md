# Fifty-Fifty

**Minesweeper, flipped.** You hide the mines. A sweeper who thinks out loud tries to survive.

> Built for Hackyard Yard #7 · theme: **Remix** · work in progress

**Play:** [raoashwini21.github.io/fifty-fifty](https://raoashwini21.github.io/fifty-fifty/)

## The remix

In the game everyone remembers, you tap squares and hope.
Here the roles swap. You hide 4 mines, press **Go**, and a little bomb-squad kid does the tapping.

He's good. He reads every number, and he never steps on a mine he could have worked out.
The only way to win is to hide your mines so cleverly that he's **forced to guess**, and guesses wrong.

- 🧠 **He thinks out loud.** Every move comes with his reason: "That 2 already has its mines. The rest are safe."
- 😰 **He sweats the guesses.** When nothing is certain, he picks the least risky square and tells you the odds. Then the drumroll.
- 📅 **Same board for everyone, every day.** Share how fast your trap caught him.
- 🔒 **Runs on your device.** No accounts, no tracking, no network requests.

## How the sweeper plays

1. Simple rules first: a number that already has its mines, or one that needs every square around it.
2. Overlapping numbers: when one number's squares sit inside another's, the difference is either all safe or all mines.
3. If that's not enough, he works through every arrangement of mines that fits what's showing, weighted by how many ways the rest of the field can be filled, and gets each square's exact chance of being a mine.
4. Only when no square is certain does he guess: the lowest chance wins.

The trap meter shows, while you place mines, how often he would have to guess. Random layouts catch him about 3% of the time; a good trap gets past 75%.

## Run it

```bash
npm test        # engine tests
npm run serve   # then open http://localhost:8000
```

No build step. The game is plain HTML, CSS and JavaScript in `docs/`.

---

MIT licence · Fonts: Barlow and JetBrains Mono (SIL Open Font License) · Art painted for this project during build week.

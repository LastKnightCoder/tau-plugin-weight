# Weight Tracker

Log morning and evening weight, what you ate, and how long you worked out, and always see how many calories you have left for today. Eating within budget and hitting exercise goals are tracked automatically, while charts and AI show what works best for you.

## What It Can Do

- **Weigh-ins**: Log once on waking and once before bed. Trends follow the 7-day average of morning weight so daily fluctuations don't distract you; evening weight shows how heavy the day's intake was.
- **One-line logging**: Type `"milk tea, 1 cup"` before eating to preview its calories and what would remain afterward. Type `"running 30 min"` to add burned calories back to today's budget. Calories are estimated by AI and can be edited anytime; edited values are remembered next time without re-estimating.
- **Browse & backfill by day**: On desktop, click any point on the trend chart or check-in grid to view that day's meals, workouts, and calorie details on the right; click the selected date again to deselect and return to today. While a past date is selected, type a line above to backfill it, or edit times, modify, or delete existing entries.
- **Daily budget**: Calculated from your height, age, sex, and current weight minus 500 kcal. It adjusts downward automatically as your weight drops, or you can lock in a fixed target manually.
- **Automatic check-ins**: Staying within budget counts as eating light, and meeting your target workout minutes counts as moving more—no manual checkboxes needed.
- **Trends**: Weight and daily intake are plotted on the same timeline so you can immediately connect an over-budget day with weight changes a few days later.
- **Effectiveness**: Compares next-morning weight changes across four combinations (both / diet only / exercise only / neither) so you can see what works best for you.
- **AI analysis**: **Today** tells you how much room is left for dinner and how much exercise remains; **This week** summarizes trends and patterns where you tend to slip.
- **Home card**: Log your weight or an entry right from the **Today** page.
- **Mobile experience**: Purpose-built touch UI on Android and iOS. Hold the mic and speak a sentence so AI splits it into multiple entries at once; dial in your weight on a ruler; swipe left on any entry to edit or delete it.

## Getting Started

1. Install and enable **Weight Tracker** in the Plugin Center.
2. Open **Settings** on the plugin details page and enter your height, birth year, sex, and optional target weight.
3. Click **Weight Tracker** in the Sidebar, weigh in tomorrow morning, and type a line before eating or working out. On mobile, find **Weight Tracker** at the top of **Me**—first launch will guide you through entering your body metrics.

## FAQ

**What can AI see?** Only your weight, calories, and the food and workout text you enter—it never reads your other notes. AI uses the model assigned to chat, asks for authorization on first use, and can be revoked anytime under **Permissions** on the plugin details page. You can also skip AI and enter calories manually.

**Can I use it without an AI model configured?** Yes. Enter calories directly whenever estimation fails, and frequent foods will autofill after you log them once. Voice input also works, just without automatic splitting and calorie estimation.

**What speech recognition does mobile voice input use?** It uses the recognition engine selected in Tau under **Me › Voice › Speech Input**. The first time you hold to speak, you'll be asked to grant speech input permission, which you can revoke anytime under **Permissions** on the plugin details page.

**Does my data sync?** Yes. Weigh-ins and logs are stored in your library and sync along with it.

**Is the calorie budget exact?** It is a formula-based estimate meant to help guide daily habits and cannot replace advice from a doctor or dietitian. If your weight does not drop for two to three consecutive weeks, consider lowering the budget slightly in Settings.

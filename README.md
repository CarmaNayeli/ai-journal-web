# 🎭 AI Creature Journal - Web Version

Your personal journaling companion with 20 unique AI personalities to support different needs.

## ✨ Features

- **20 Unique Companions** - From Rowan the gentle coyote to Athena the wise owl
- **Companion Quiz** - Answer 3 questions to find your perfect match
- **Journal Recording** - Auto-save conversations with timestamps
- **Todo List** - Integrated task management
- **Journal History** - Search and review past entries
- **Browser Storage** - All data stored locally in your browser

## 🚀 Quick Start

### Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` folder.

### Deploy to Vercel

1. Push this repo to GitHub
2. Import the project in Vercel
3. Deploy!

Or use the Vercel CLI:

```bash
npm install -g vercel
vercel
```

## 🔑 API Key Setup

You need a Claude API key from Anthropic:

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Add credits to your account
4. Create an API key
5. Enter it in the app settings (⚙️ button)

**⚠️ Important:** API usage costs real money (~$15-60/month depending on usage).

## 📱 How It Works

- All data is stored in your browser's localStorage
- No backend required
- API calls go directly to Anthropic from your browser
- Your API key is stored locally and never sent anywhere except Anthropic

## ⚠️ Disclaimer

This is a journaling tool, NOT therapy or medical advice. If you're in crisis:

- 🆘 US: Call or text **988** (Suicide Prevention Lifeline)
- 🆘 US: Text **HOME** to **741741** (Crisis Text Line)
- 🆘 Emergency: Call **911**

## 📖 Companions

Choose from 20 unique companions:

- **Rowan** 🐺 - Gentle, nurturing support
- **Athena** 🦉 - Wise pattern recognition
- **River** 🦦 - Playful creative exploration
- **Phoenix** 🔥 - Transformation and growth
- **Anchor** ⚓ - Grounding and stability
- And 15 more!

## 🛠️ Tech Stack

- Vanilla JavaScript (ES6+)
- Vite for bundling
- Axios for API calls
- LocalStorage for data persistence
- CSS for styling

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Feel free to open issues or PRs.

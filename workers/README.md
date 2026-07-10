# Workers - Autonomous AI Engine

This Python service executes the heavy lifting: gathering data from the web and processing it through LLMs to extract insights and generate strategies.

## Tech Stack
- Language: Python 3.x
- Scraping: Playwright / BeautifulSoup
- AI/LLM: LangChain / OpenAI / Gemini APIs

## Worker Agents
1. **Scraping Agent (`/scraping_agent`):** Ingests URLs or queries to scrape public competitor data and consumer reviews. Supports targeted inputs or autonomous discovery.
2. **Analysis Agent (`/analysis_agent`):** Evaluates scraped text for consumer sentiment and brand authenticity.
3. **Strategy Agent (`/strategy_agent`):** Converts analysis into actionable marketing steps and strategic responses.
4. **Simulation Agent (`/simulation_agent`):** (Stubbed) Future implementation for the Virtual Focus Group challenge.

## Setup & Run

1. Create and activate a virtual environment:
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

2. Install dependencies:
   pip install -r requirements.txt

3. Set your environment variables (LLM API keys):
   cp .env.example .env

4. Run the main worker script:
   python main.py
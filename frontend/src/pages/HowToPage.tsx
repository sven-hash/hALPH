export function HowToPage() {
  return (
    <div className="w-full max-w-4xl rounded-sm border-4 border-[#8B7355] bg-[#F5F0E8] px-6 py-8 shadow-2xl sm:px-10 lg:max-w-5xl lg:px-12 xl:max-w-6xl">
      <h2 className="font-roman text-2xl font-semibold text-[#1C1C1C] mb-6 text-center">How to Play</h2>

      <div className="space-y-6 text-sm text-[#1C1C1C]/80">
        <section>
          <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">The Game</h3>
          <p className="mb-2">
            The hALPHing is a timer-halving survival game on Alephium blockchain. A countdown timer starts at ~2026 years.
            Each time someone plays, the timer is <strong>halved</strong> and that player becomes the current leader.
          </p>
          <p>
            When the timer runs out, the last leader <strong>wins 80%</strong> of the pot. The remaining 20% seeds the next round.
          </p>
        </section>

        <section>
          <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">How to Enter</h3>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Enter the Arena</strong> — Pay the entry fee to halve the timer (÷2) and become leader</li>
            <li><strong>Double Down</strong> — Pay 2x the entry fee to quarter the timer (÷4) and become leader</li>
          </ul>
          <p className="mt-2 text-xs text-[#1C1C1C]/60">
            The entry fee starts at 5 ALPH and increases by 1% after each round settles.
          </p>
        </section>

        <section>
          <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">Predicting</h3>
          <p>
            You can also bet on who you think will win the current round. Place bets on any player who has entered the arena.
            If your chosen player wins, you receive a proportional share of the betting pool based on your stake.
          </p>
        </section>

        <section>
          <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">Getting ALPH</h3>
          <p className="mb-2">To play, you need ALPH (Alephium's native token). Here's how to get some:</p>
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <strong>Install a Wallet</strong> — Download the{' '}
              <a href="https://alephium.org/wallets" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">
                Alephium Extension Wallet
              </a>{' '}
              for your browser
            </li>
            <li>
              <strong>Buy ALPH</strong> — Purchase on exchanges like{' '}
              <a href="https://www.gate.io/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">Gate.io</a>,{' '}
              <a href="https://www.mexc.com/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">MEXC</a>, or{' '}
              <a href="https://www.bitget.com/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">Bitget</a>
            </li>
            <li>
              <strong>Withdraw to Wallet</strong> — Send ALPH to your wallet address
            </li>
            <li>
              <strong>Connect & Play</strong> — Click "Connect Wallet" and enter the arena!
            </li>
          </ol>
        </section>

        <section className="border-t border-[#1C1C1C]/10 pt-4">
          <h3 className="font-roman text-lg font-semibold text-[#1C1C1C]/70 mb-2">Strategy Tips</h3>
          <ul className="list-disc list-inside space-y-1 text-[#1C1C1C]/60">
            <li>The timer halves each play, so early plays are cheap but give lots of time for others</li>
            <li>As the timer gets shorter, it becomes more valuable to be the last player</li>
            <li>Double Down is riskier but quarters the timer, giving others less time to react</li>
            <li>Watch the pot size — bigger pots attract more competition</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

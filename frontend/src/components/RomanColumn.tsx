import columnImage from '../assets/column.png'

export function RomanColumn({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`hidden lg:block self-stretch ${side === 'left' ? 'mr-1' : 'ml-1'}`}>
      <img
        src={columnImage}
        alt="Roman column"
        className={`h-full w-[50px] rounded-lg object-cover object-top ${side === 'right' ? 'scale-x-[-1]' : ''}`}
      />
    </div>
  )
}

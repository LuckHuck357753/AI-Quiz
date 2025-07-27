import React from "react";

interface HourglassProps {
  secondsLeft: number;
}

const Hourglass: React.FC<HourglassProps> = ({ secondsLeft }) => {
  return (
    <div className="flex flex-col items-center mt-4">
      <div className="mb-2 text-yellow-400 font-semibold text-sm">время на ответ</div>
      <div className="text-4xl mb-3">⏳</div>
      <div className="text-yellow-400 text-3xl font-bold select-none">{secondsLeft}</div>
    </div>
  );
};

export default Hourglass; 
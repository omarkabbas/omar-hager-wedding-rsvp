"use client";
import { useState, useEffect } from 'react';
import Image from "next/image";

const images = [
  '/oh1.JPG',
  '/oh2.JPG',
  '/oh3.JPG',
  '/oh4.JPG'
];

export default function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Rotate the image every 4.5 seconds
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 4500); 
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-stone-100 rounded-sm">
      {images.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Image
            src={src}
            alt={`Omar and Hager ${index + 1}`}
            fill
            sizes="(max-width: 768px) 92vw, 640px"
            className="h-full w-full object-cover"
            priority={index === 0}
          />
        </div>
      ))}
    </div>
  );
}

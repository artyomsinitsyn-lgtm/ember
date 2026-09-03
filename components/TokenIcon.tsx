function isImagePath(image: string) {
  return image.startsWith("/uploads/") || image.startsWith("data:image/");
}

export default function TokenIcon({
  image,
  size = 40,
  textSize = "text-xl",
}: {
  image: string;
  size?: number;
  textSize?: string;
}) {
  if (isImagePath(image)) {
     
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="w-full h-full object-cover"
      />
    );
  }
  return <span className={textSize}>{image}</span>;
}

import { HairlineFigure } from "./HairlineFigure";

export function HairlineArchive() {
  return (
    <figure className="archive-figure isometric-card">
      <HairlineFigure
        name="archive"
        className="archive-stage"
        label="A stepped archive cabinet"
        errorMessage="The archive preview couldn’t load."
      />
    </figure>
  );
}

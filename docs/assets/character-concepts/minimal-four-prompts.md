# 최소형 4종 기준 시안 생성 기록

- 생성일: 2026-10-10
- 도구: 내장 image_gen (CLI 미사용)
- 결과: [initial-four-minimal-v1.png](initial-four-minimal-v1.png)
- 상태: 사용자 채택 기준 시안. 외형은 수정 가능하며 제품용 스프라이트는 아직 제작하지 않음.
- 생성 결과에는 미세한 질감과 격자 차이가 있어 아래 지시의 모든 조건을 충족한 최종 에셋으로 간주하지 않음.

## 생성 프롬프트 원문

```text
Use case: stylized-concept
Asset type: single comparison sheet for Plannet's four initial pixel pet concepts, exploratory art.
Primary request: EXTREMELY SIMPLE, very low pixel-count virtual pet characters: dog, rabbit, chick, cat. Make all four much simpler than ordinary pixel-art mascots. Each sprite must look designed on a tiny approximately 12 by 12 to 16 by 16 logical pixel grid and enlarged with nearest-neighbor sharp block edges. One chunky square pixel is the smallest detail. Consistent pixel size across all characters.
Composition: one square white canvas, airy 2 by 2 arrangement. Top left dog, top right rabbit, bottom left chick, bottom right cat. Exactly four characters, one pose each, no other objects, no captions.
Design: almost head-and-body-as-one little blobs, no separate neck or torso, no clothing, no props, no accessories. Flat fills, each pet only 3 colors plus outline. Sparse dark cocoa one-pixel outlines, two single pixel eyes, tiny mouth only if necessary. No highlights, no shading, no blush, no ground shadows. Slightly imperfect cute silhouettes, tender calm feeling, tiny retro virtual pets.
Dog: cream roundish blob with two short floppy tan ears, minimal feet.
Rabbit: cream blob with two simple tall block ears, minimal feet.
Chick: soft yellow blob with tiny orange beak and two short feet.
Cat: pale peach blob with two short triangular stepped ears and one small side tail, no whiskers.
Avoid: sprout, leaves, plants, humans, bear, scenery, lettering, watermark, gradients, smooth curves, antialiasing, high-resolution detail, complex facial anatomy, elaborate body parts. Keep silhouette readability at truly tiny UI sizes.
```

## 흑백 비교 시안

- 도구: 내장 image_gen 편집 (CLI 미사용)
- 입력: `initial-four-minimal-v1.png`
- 결과: [initial-four-minimal-mono-v1.png](initial-four-minimal-mono-v1.png)
- 상태: 컬러와 비교할 후보. 최종 색상 방식 미정.

```text
Edit target: supplied four-pet pixel art comparison sheet. Create a black and white version of this exact design. Preserve the four characters' silhouettes, facial expressions, pixel block shapes, sizes, proportions, positions and the 2x2 layout: dog top left, rabbit top right, chick bottom left, cat bottom right. Change only the palette and remove paper texture: pure black outlines, eyes and mouths, white bodies and background, minimal flat light gray for dog ears and rabbit/cat inner ears if needed for legibility. Chick beak and feet black. Crisp minimal retro monochrome pixel art, no colors, no gradients, no shadows, no new details, no text. Keep the original character identities and whitespace.
```

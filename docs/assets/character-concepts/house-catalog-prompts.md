# 집 10종 × 5단계 생성 기록

2026-10-10 · 내장 image_gen 사용, CLI 미사용.

입력: 초기 4종 캐릭터 비교판을 귀여운 비율·색감 참고로 사용. 캐릭터 자체를 집으로 바꾸거나 제품 코드를 수정하지 않음.

결과: [01–05](house-catalog-01-05-v1.png), [06–10](house-catalog-06-10-v1.png). 50개 장면의 비교용 시안이며 일정 픽셀 격자·투명 배경·개별 스프라이트 분리·단계별 치수 검증을 완료한 제품 에셋은 아님.

## 01–05 · 포근한 작은 집

```text
Use case: stylized-concept. ONE pixel-art game-house development catalog, a precise 5 ROW by 5 COLUMN matrix, exactly 25 small house construction scenes. White background with plenty of cell padding, front-facing mostly flat view, clean art book comparison sheet. A high resolution output but LOW logical pixel count per sprite.
The reference four pets is a STYLE/MOOD reference only: capture their cute plump proportions, few chunky pixels, warm gentle palette, thick dark cocoa outlines, minimal details. DO NOT draw these pets, animals, people or faces on houses. Do NOT reproduce a mobile screen, infographic app, generic UI icons or console frame.
CRITICAL STYLE: houses must be adorable collectable little fantasy homes, like tiny cozy virtual pet dwellings. Squat round plump bodies, oversized roofs, tiny doors, single warm window. Restrained flat pastel color palette per house, about 24-32 logical pixels wide, crisp square stepped outlines. No smooth vector curves, no micro-details, no elaborate landscaping, no dense texturing, no photorealistic depth. Every house has a distinctive silhouette; not ten recolors of the same triangle house. Details limited to ONE personality accent at final stage. Stages clearly BUILD rather than adding random decorations to five identical finished houses.
Grid top column labels exactly: '1 터 잡기', '2 골조', '3 지붕', '4 불 켜기', '5 완성'. Left row labels as specified below. Use readable Korean simple type outside the sprites. No text inside sprites.
Each row is ONE exact house type at five progress stages left to right:
1: SMALL exposed foundation/base matching its unique footprint, a few tidy material pieces, no completed walls or roof. Still warm and inviting.
2: OPEN incomplete lower body/wall framework matching its theme, obvious missing roof/top, hollow interior visible.
3: CLOSED distinctive plump silhouette with roof/top complete, door opening and UNLIT dark window, unfinished entrance, no final accessory.
4: SAME silhouette, installed small door and ONE golden lit window, almost complete.
5: SAME silhouette and window, add its specified one signature accent, welcoming complete dwelling. Do not change house species/shape mid-row. Keep completed stage 3/4/5 same overall silhouette and scale.
Only tiny plain ground pads, no background scenery. No trees/flowers other than a single specifically requested finishing accent, no debris, no scary decay.
Small footer '집 5종 × 성장 5단계 · 콘셉트 시안'. IMPORTANT: 25 scenes arranged 5x5, not 4 or 6 columns, no duplicates or merged cells.
Board title '01–05 · 포근한 작은 집'. ROWS:
'01 둥근 오두막': chubby cream cottage, oversized rounded terracotta dome roof (not triangular), miniature arched door, one butter-yellow square window. Final accent small crooked chimney with two square smoke pixels.
'02 버섯집': short chunky cream mushroom stem house with oversized dusty-pink cap with only THREE big cream spots, tiny door in stem, one window. Final accent single doorstep.
'03 도토리집': squat round caramel acorn body, huge cocoa cap roof, one little top nub, tiny door. Final accent ONE mint-green leaf on cap.
'04 찻주전자집': plump pastel lavender teapot body, short squat spout left and curved chunky handle right, lid is roof, door on front and tiny window. Stage1 potbase, stage2 hollow potbody without lid, stage3 lid installed. Final accent two tiny steam pixels from spout.
'05 호박집': pale peach round pumpkin house, just THREE broad pumpkin lobes, green stubby stem roof, door and one golden window. Final accent single curled green vine, no scary jack-o-lantern eyes.
```

## 06–10 · 꿈꾸는 작은 집

```text
Use case: stylized-concept. ONE pixel-art game-house development catalog, a precise 5 ROW by 5 COLUMN matrix, exactly 25 small house construction scenes. White background with plenty of cell padding, front-facing mostly flat view, clean art book comparison sheet. A high resolution output but LOW logical pixel count per sprite.
The reference four pets is a STYLE/MOOD reference only: capture their cute plump proportions, few chunky pixels, warm gentle palette, thick dark cocoa outlines, minimal details. DO NOT draw these pets, animals, people or faces on houses. Do NOT reproduce a mobile screen, infographic app, generic UI icons or console frame.
CRITICAL STYLE: houses must be adorable collectable little fantasy homes, like tiny cozy virtual pet dwellings. Squat round plump bodies, oversized roofs, tiny doors, single warm window. Restrained flat pastel color palette per house, about 24-32 logical pixels wide, crisp square stepped outlines. No smooth vector curves, no micro-details, no elaborate landscaping, no dense texturing, no photorealistic depth. Every house has a distinctive silhouette; not ten recolors of the same triangle house. Details limited to ONE personality accent at final stage. Stages clearly BUILD rather than adding random decorations to five identical finished houses.
Grid top column labels exactly: '1 터 잡기', '2 골조', '3 지붕', '4 불 켜기', '5 완성'. Left row labels as specified below. Use readable Korean simple type outside the sprites. No text inside sprites.
Each row is ONE exact house type at five progress stages left to right:
1: SMALL exposed foundation/base matching its unique footprint, a few tidy material pieces, no completed walls or roof. Still warm and inviting.
2: OPEN incomplete lower body/wall framework matching its theme, obvious missing roof/top, hollow interior visible.
3: CLOSED distinctive plump silhouette with roof/top complete, door opening and UNLIT dark window, unfinished entrance, no final accessory.
4: SAME silhouette, installed small door and ONE golden lit window, almost complete.
5: SAME silhouette and window, add its specified one signature accent, welcoming complete dwelling. Do not change house species/shape mid-row. Keep completed stage 3/4/5 same overall silhouette and scale.
Only tiny plain ground pads, no background scenery. No trees/flowers other than a single specifically requested finishing accent, no debris, no scary decay.
Small footer '집 5종 × 성장 5단계 · 콘셉트 시안'. IMPORTANT: 25 scenes arranged 5x5, not 4 or 6 columns, no duplicates or merged cells.
Board title '06–10 · 꿈꾸는 작은 집'. ROWS:
'06 조개집': squat pastel peach clam-shell house with 3 broad scallops forming dome roof, cream lower base, tiny door and window. Final accent ONE round pale pearl by doorway.
'07 구름집': compact cream/lavender cloud-shaped puffy dwelling, THREE large rounded lobes, flat bottom, little door and window. Final accent one tiny hanging golden star at corner, no rain.
'08 달집': plump pale yellow crescent-shaped shelter, crescent itself encloses tiny cream room at bottom, window and door in lower body. Final accent one dangling tiny lavender bell from crescent tip. Large simple crescent silhouette, not an observatory.
'09 별집': soft five-point butter-yellow star shaped HOUSE, stubby rounded stepped points, small centered door near bottom and one small upper window, no face. Final accent single violet flag at top point.
'10 천문대집': squat round pale blue body with oversized lavender hemisphere roof, tiny front door and warm window; final stage adds ONE short chunky telescope projecting diagonally from dome. No rings, no complex machinery. Stage3 dome complete but no telescope, stage4 window lit, stage5 telescope appears.
```


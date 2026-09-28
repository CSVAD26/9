// p5.js global mode: the library calls setup() once, then draw() repeatedly.
// Keep this file focused on this sketch. Store its media in assets/.

function setup() {
  const canvas = createCanvas(400, 480);
  canvas.parent('sketch');
  describe('A Smily face');
}

function draw() {
  background(245, 245, 242);


  fill(225,225,0);

  circle (200,200,200);
  arc(200,220,120,100,0,PI);

  arc(250,175,55,50,PI,0);
  arc(150,175,55,50,PI,0);


}

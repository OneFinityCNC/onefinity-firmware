#pragma once

#include <math.h>


class SCurve {
  float maxV;
  float maxA;
  float maxJ;

  float v;
  float a;
  float j;

public:
  SCurve(float maxV = 0, float maxA = 0, float maxJ = 0);

  float getMaxVelocity() const {return maxV;}
  void setMaxVelocity(float v) {maxV = v;}
  float getMaxAcceleration() const {return maxA;}
  void setMaxAcceleration(float a) {maxA = a;}
  float getMaxJerk() const {return maxJ;}
  void setMaxJerk(float j) {maxJ = j;}

  float getVelocity() const {return v;}
  float getAcceleration() const {return a;}
  float getJerk() const {return j;}

  unsigned getPhase() const;
  float getStoppingDist() const;
  float next(float t, float targetV);

  static float stoppingDist(float v, float a, float maxA, float maxJ);
  static float nextAccel(float t, float targetV, float v, float a, float maxA,
                         float maxJ);
  static float distance(float t, float v, float a, float j);
  static float velocity(float t, float a, float j);
  static float acceleration(float t, float j);
};

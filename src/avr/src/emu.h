#ifdef __AVR__
#define emu_init()
#define emu_callback()

#else
void emu_init();
void emu_callback();

#endif

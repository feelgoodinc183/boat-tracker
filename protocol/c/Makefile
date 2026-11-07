CC ?= cc
CFLAGS ?= -std=c99 -O2 -Wall -Wextra -Wpedantic -Wconversion -Werror

test/run_tests: tmtrac_protocol.c tmtrac_protocol.h test/test_main.c test/test_vectors.h
	$(CC) $(CFLAGS) -I. -o $@ tmtrac_protocol.c test/test_main.c

.PHONY: test sanitize clean
test: test/run_tests
	./test/run_tests

# Same tests with address and undefined-behaviour checks.
sanitize:
	$(CC) -std=c99 -g -O1 -Wall -Wextra -fsanitize=address,undefined -fno-sanitize-recover=all -I. \
		-o test/run_tests_sanitized tmtrac_protocol.c test/test_main.c
	./test/run_tests_sanitized

clean:
	rm -f test/run_tests test/run_tests_sanitized
